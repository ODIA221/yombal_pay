// Tests de bout en bout (mode démo, base PostgreSQL de test dédiée) :
// boutique → paiement → webhook Bitnob signé → registre → notification marchand → conversion → retrait,
// plus les garde-fous de sécurité (sessions, CSRF, clés, URL, double dépense).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { ensureDatabase } from './ensure-db.mjs';

// pg est installé dans server/ (accès direct à la base pour simuler une écriture falsifiée)
const { Client: PgClient } = createRequire(new URL('../server/package.json', import.meta.url))('pg');

const API = 'http://localhost:3100';
const SHOP = 'http://localhost:4100';
const BITNOB_WEBHOOK_SECRET = 'test_bitnob_webhook_secret';
const DB = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/yombal_pay_test';

// Base de test vierge à chaque exécution
try {
  await ensureDatabase(DB, { reset: true });
} catch (err) {
  console.error(`❌ Impossible de (re)créer la base de test (${err.message}). Postgres est-il lancé ? Sinon, renseignez TEST_DATABASE_URL.`);
  process.exit(1);
}

const env = {
  ...process.env,
  PORT: '3100', PUBLIC_URL: API, DATABASE_URL: DB, DEMO_MODE: 'true', RATE_PUBLIC_FALLBACK: 'false',
  BITNOB_WEBHOOK_SECRET, DEMO_MERCHANT_WEBHOOK_URL: `${SHOP}/webhooks/yombalpay`,
  SHOP_PORT: '4100', SHOP_URL: SHOP, YOMBALPAY_URL: API, PAYOUT_MODE: 'simulated',
};
const procs = [spawn('node', ['server/src/index.js'], { env }), spawn('node', ['shop/server.js'], { env })];
let serverLog = '';
procs[0].stdout.on('data', (d) => (serverLog += d));
procs[0].stderr.on('data', (d) => (serverLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};
const json = (r) => r.json();

// Petit client « navigateur » : cookie de session + en-tête anti-CSRF
function browser() {
  let cookie = '';
  return async (path, { method = 'GET', body, csrf = true } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (csrf && method !== 'GET') headers['X-YombalPay-CSRF'] = '1';
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return r;
  };
}

try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${API}/v1/health`)).ok) break;
    } catch {}
    await sleep(250);
  }
  await sleep(300);
  const K = { Authorization: 'Bearer sk_test_acs_demo_2026', 'Content-Type': 'application/json' };
  check((await json(await fetch(`${API}/v1/merchant`, { headers: K }))).has_payout_pin === true, 'Compte démo : code de retrait défini (2026 par défaut)');

  // ── Parcours de paiement ──────────────────────────────────────────────────
  const buy = await fetch(`${SHOP}/buy/dashiki`, { method: 'POST', redirect: 'manual' });
  const payUrl = buy.headers.get('location');
  check(buy.status === 303 && payUrl?.includes('/pay/chk_'), `Boutique → redirection vers ${payUrl}`);
  const id = payUrl.split('/pay/')[1];

  const c = await json(await fetch(`${API}/v1/checkouts/${id}`, { headers: K }));
  check(c.status === 'pending' && c.amount === 12500 && c.amount_sats > 0 && c.payment_request, `Paiement ${c.amount} FCFA = ${c.amount_sats} sats, facture Lightning prête`);

  check(Math.abs(c.savings?.xof - 500) <= 1 && c.savings.benchmark_pct === 5, `Frais évités affichés au client : ${c.savings?.xof} FCFA (5 % moins la commission 1 %)`);

  const ov0 = await json(await fetch(`${API}/v1/overview`, { headers: K }));
  const body = JSON.stringify({ id: 'evt_1', event: 'transfer.success', data: { reference: `yp_${id}`, status: 'paid' } });
  const bad = await fetch(`${API}/webhooks/bitnob`, { method: 'POST', headers: { 'x-bitnob-signature': 'deadbeef' }, body });
  check(bad.status === 401, 'Webhook Bitnob à signature invalide rejeté (401)');

  const sig = crypto.createHmac('sha512', BITNOB_WEBHOOK_SECRET).update(body).digest('hex');
  const ok = await json(await fetch(`${API}/webhooks/bitnob`, { method: 'POST', headers: { 'x-bitnob-signature': sig, 'content-type': 'application/json' }, body }));
  check(ok.status === 'paid', 'Webhook Bitnob signé (HMAC-SHA512) → paiement « Payé »');

  const dup = await json(await fetch(`${API}/webhooks/bitnob`, { method: 'POST', headers: { 'x-bitnob-signature': sig }, body }));
  check(dup.status === 'duplicate', 'Rejeu du webhook ignoré (idempotence en base)');
  const paidView = await json(await fetch(`${API}/v1/checkouts/${id}`));
  check(c.proof === null && paidView.proof?.type === 'lightning' && Boolean(paidView.proof.payment_hash), 'Reçu : preuve Lightning disponible seulement une fois payé');

  const ov1 = await json(await fetch(`${API}/v1/overview`, { headers: K }));
  const credited = ov1.balance.btc.sats - ov0.balance.btc.sats;
  const fee = Math.floor(c.amount_sats / 100);
  check(credited === c.amount_sats - fee, `Registre : +${credited} sats crédités (commission 1 % = ${fee} sats)`);
  check(ov1.stats.savings_xof - ov0.stats.savings_xof === c.savings.xof, `Compteur marchand : +${ov1.stats.savings_xof - ov0.stats.savings_xof} FCFA de frais évités`);

  await sleep(800);
  const order = await json(await fetch(`${SHOP}/api/orders/${c.reference}`));
  check(order.status === 'Payée', `Commande ${c.reference} passée à « Payée » sur la boutique (webhook marchand signé)`);

  const dl = await json(await fetch(`${API}/v1/deliveries`, { headers: K }));
  check(dl.data.filter((d) => d.checkout_id === id && d.status === 'delivered').length === 1, 'Une seule notification livrée au marchand');

  const again = await fetch(`${API}/v1/checkouts`, { method: 'POST', headers: K, body: JSON.stringify({ amount: 5000, reference: c.reference }) });
  check(again.status === 200 && (await json(again)).id === id, 'Référence déjà vue → paiement existant renvoyé, pas de doublon');

  // ── Paiement en USDT (adresse de dépôt Bitnob + deposit.success) ───────────
  const signed = (evt) => {
    const raw = JSON.stringify(evt);
    return fetch(`${API}/webhooks/bitnob`, { method: 'POST', headers: { 'x-bitnob-signature': crypto.createHmac('sha512', BITNOB_WEBHOOK_SECRET).update(raw).digest('hex') }, body: raw });
  };
  const u0 = await json(await fetch(`${API}/v1/checkouts`, { method: 'POST', headers: K, body: JSON.stringify({ amount: 12000, reference: 'usdt-1' }) }));
  check(u0.usdt?.available && u0.usdt.amount === '20.00', `Paiement de 12 000 FCFA payable en ${u0.usdt?.amount} USDT`);
  const u1 = await json(await fetch(`${API}/v1/checkouts/${u0.id}/usdt`, { method: 'POST', headers: K, body: JSON.stringify({ chain: 'tron' }) }));
  const tronAddr = u1.usdt?.addresses?.[0]?.address;
  check(/^T\w{33}$/.test(tronAddr || ''), `Adresse de dépôt Tron générée : ${tronAddr}`);
  const u2 = await json(await fetch(`${API}/v1/checkouts/${u0.id}/usdt`, { method: 'POST', headers: K, body: JSON.stringify({ chain: 'tron' }) }));
  check(u2.usdt.addresses.length === 1 && u2.usdt.addresses[0].address === tronAddr, 'Même réseau → même adresse (idempotent)');
  check((await fetch(`${API}/v1/checkouts/${u0.id}/usdt`, { method: 'POST', headers: K, body: JSON.stringify({ chain: 'dogecoin' }) })).status === 422, 'Réseau non proposé refusé');

  const usdtBefore = (await json(await fetch(`${API}/v1/overview`, { headers: K }))).balance.usdt.micro;
  const dep = (n, micro) => ({ event: 'deposit.success', event_id: `evt_dep_${n}`, transaction_id: `tx_dep_${n}`, address: tronAddr, chain: 'tron', currency: 'USDT', amount: String(micro), hash: `0xhash${n}` });
  const forged = await fetch(`${API}/webhooks/bitnob`, { method: 'POST', headers: { 'x-bitnob-signature': 'deadbeef' }, body: JSON.stringify(dep(0, 20_000_000)) });
  check(forged.status === 401, 'Dépôt USDT non signé rejeté (401)');
  const part = await json(await signed(dep(1, 5_000_000)));
  const afterPart = await json(await fetch(`${API}/v1/checkouts/${u0.id}`));
  check(part.status === 'pending' && afterPart.usdt.received === '5.00', 'Dépôt partiel (5 USDT) : paiement toujours en attente, reçu affiché');
  const full = await json(await signed(dep(2, 15_000_000)));
  const afterFull = await json(await fetch(`${API}/v1/checkouts/${u0.id}`));
  check(full.status === 'paid' && afterFull.pay_asset === 'USDT', 'Reste envoyé (15 USDT) → paiement « Payé » en USDT');
  check(afterFull.proof?.type === 'blockchain' && afterFull.proof.transactions.length === 2, 'Reçu : les 2 transactions blockchain servent de preuve');
  check((await json(await signed(dep(2, 15_000_000)))).status === 'duplicate', 'Rejeu du dépôt ignoré');
  const usdtAfter = (await json(await fetch(`${API}/v1/overview`, { headers: K }))).balance.usdt.micro;
  check(usdtAfter - usdtBefore === 19_800_000, `Registre : +${(usdtAfter - usdtBefore) / 1e6} USDT crédités (20 USDT moins 1 %)`);
  const extra = await json(await signed(dep(3, 1_000_000)));
  const usdtExtra = (await json(await fetch(`${API}/v1/overview`, { headers: K }))).balance.usdt.micro;
  check(extra.extra && usdtExtra - usdtAfter === 990_000, 'Dépôt arrivé après paiement : crédité quand même (commission déduite)');
  check((await json(await signed({ ...dep(4, 1_000_000), address: 'Tinconnue' }))).status === 'ignored', 'Dépôt sur une adresse inconnue ignoré');

  const p0 = await json(await fetch(`${API}/v1/checkouts`, { method: 'POST', headers: K, body: JSON.stringify({ amount: 12000, reference: 'usdt-partiel' }) }));
  const p1 = await json(await fetch(`${API}/v1/checkouts/${p0.id}/usdt`, { method: 'POST', headers: K, body: JSON.stringify({ chain: 'bsc' }) }));
  const bscAddr = p1.usdt.addresses[0].address;
  const usdtPre = (await json(await fetch(`${API}/v1/overview`, { headers: K }))).balance.usdt.micro;
  const pr = await json(await signed({ ...dep(5, 3_000_000), address: bscAddr, chain: 'bsc' }));
  const usdtPost = (await json(await fetch(`${API}/v1/overview`, { headers: K }))).balance.usdt.micro;
  check(pr.status === 'pending' && usdtPost - usdtPre === 2_970_000, 'Paiement partiel jamais complété : les 3 USDT reçus sont quand même crédités');

  const s0 = await json(await fetch(`${API}/v1/checkouts`, { method: 'POST', headers: K, body: JSON.stringify({ amount: 3000, reference: 'usdt-sim' }) }));
  await fetch(`${API}/v1/checkouts/${s0.id}/usdt`, { method: 'POST', headers: K, body: JSON.stringify({ chain: 'polygon' }) });
  const sim = await json(await fetch(`${API}/v1/checkouts/${s0.id}/simulate-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset: 'USDT' }) }));
  check(sim.checkout.status === 'paid' && sim.checkout.pay_asset === 'USDT', 'Démo : dépôt USDT simulé sur Polygon → « Payé »');
  const tiny = await json(await fetch(`${API}/v1/checkouts`, { method: 'POST', headers: K, body: JSON.stringify({ amount: 500, reference: 'usdt-tiny' }) }));
  check(tiny.usdt.available === false, 'Moins de 2 USDT : option USDT masquée');

  // ── Clés et permissions ───────────────────────────────────────────────────
  const pk = { Authorization: 'Bearer pk_test_acs_demo_2026', 'Content-Type': 'application/json' };
  check((await fetch(`${API}/v1/checkouts`, { method: 'POST', headers: pk, body: JSON.stringify({ amount: 2000 }) })).status === 201, 'Clé publique pk_ : création autorisée');
  check((await fetch(`${API}/v1/checkouts`, { headers: pk })).status === 403, 'Clé publique pk_ : lecture des paiements refusée');
  check((await fetch(`${API}/v1/checkouts`, { headers: { Authorization: 'Bearer sk_test_inventee' } })).status === 401, 'Clé secrète inconnue refusée (401)');
  check((await fetch(`${API}/v1/payouts`, { method: 'POST', headers: K, body: '{}' })).status === 403, 'Retrait impossible avec une simple clé API (session exigée)');
  const xss = await fetch(`${API}/v1/checkouts`, { method: 'POST', headers: K, body: JSON.stringify({ amount: 1000, return_url: 'javascript:alert(1)' }) });
  check(xss.status === 422, 'return_url « javascript: » refusée (anti-XSS)');

  // ── Comptes marchands ─────────────────────────────────────────────────────
  const anon = browser();
  check((await anon('/v1/overview')).status === 401, 'Espace marchand inaccessible sans connexion');
  const weak = await anon('/v1/auth/signup', { method: 'POST', body: { name: 'Test', username: 'faible', email: 'f@x.sn', password: '123' } });
  check(weak.status === 422, 'Mot de passe faible refusé à l’inscription');

  const me = browser();
  const su = await me('/v1/auth/signup', { method: 'POST', body: { name: 'Boutique Fatou', username: 'fatou', email: 'fatou@test.sn', password: 'dakar2026' } });
  const suj = await json(su);
  check(su.status === 201 && suj.secret_key?.startsWith('sk_test_') && suj.merchant.lightning_address.startsWith('fatou@'), `Inscription → clé secrète affichée une fois, adresse ${suj.merchant?.lightning_address}`);
  check((await me('/v1/auth/signup', { method: 'POST', body: { name: 'Autre', username: 'fatou', email: 'autre@test.sn', password: 'dakar2026' } })).status === 409, 'Identifiant déjà pris refusé (409)');

  const stolen = await fetch(`${API}/v1/checkouts/${id}`, { headers: { Authorization: `Bearer ${suj.secret_key}` } });
  check(stolen.status === 404, "Un marchand ne voit pas les paiements d'un autre (isolation)");

  check((await me('/v1/conversions', { method: 'POST', body: { sats: 5000 }, csrf: false })).status === 403, 'Requête sans en-tête anti-CSRF refusée');

  // ── Adresse Lightning (LNURL-pay) ─────────────────────────────────────────
  const lnp = await json(await fetch(`${API}/.well-known/lnurlp/fatou`));
  check(lnp.tag === 'payRequest' && lnp.callback.endsWith('/lnurlp/fatou/callback') && lnp.minSendable > 0, 'LNURL-pay : métadonnées de fatou@… servies');
  const cb = await json(await fetch(`${lnp.callback}?amount=${30000 * 1000}&comment=${encodeURIComponent('Pour maman')}`));
  check(cb.pr?.startsWith('lnbc') && cb.verify, 'LNURL-pay : facture générée pour 30 000 sats (+ URL de vérification LUD-21)');
  const lnId = cb.verify.split('/').pop();
  await fetch(`${API}/v1/checkouts/${lnId}/simulate-payment`, { method: 'POST' });
  const verify = await json(await fetch(cb.verify));
  check(verify.settled === true, 'LUD-21 : le portefeuille voit la facture réglée');

  // ── Page publique ─────────────────────────────────────────────────────────
  const pub = await fetch(`${API}/v1/public/merchants/fatou/checkouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 15000, payer_name: 'Awa', note: 'Cadeau' }) });
  const pubj = await json(pub);
  check(pub.status === 201 && pubj.amount === 15000, 'Page publique /@fatou : paiement à montant libre créé');
  await fetch(`${API}/v1/checkouts/${pubj.id}/simulate-payment`, { method: 'POST' });

  // ── Conversion USDT et retraits ───────────────────────────────────────────
  let ov = await json(await me('/v1/overview'));
  check(ov.stats.paid_count === 2 && ov.balance.btc.sats > 0, `Solde de Fatou : ${ov.balance.btc.sats} sats ≈ ${ov.balance.total_xof} FCFA`);

  const conv = await me('/v1/conversions', { method: 'POST', body: { sats: 10000 } });
  const convj = await json(conv);
  ov = await json(await me('/v1/overview'));
  check(conv.status === 201 && Number(convj.usdt) > 0 && ov.balance.usdt.micro > 0, `Conversion 10 000 sats → ${convj.usdt} USDT`);

  const po = (b) => me('/v1/payouts', { method: 'POST', body: { network: 'wave', phone: '77 123 45 67', account_name: 'Fatou Diop', password: 'dakar2026', ...b } });
  check((await po({ password: 'mauvais' })).status === 401, 'Retrait refusé avec un mauvais mot de passe');
  check((await po({ amount: 9_000_000 })).status === 422, 'Retrait supérieur au solde refusé');
  check((await po({ amount: 2000, phone: '12345' })).status === 422, 'Numéro mobile money invalide refusé');
  const exp = await json(await me('/v1/merchant', { method: 'PATCH', body: { payout: { network: 'expresso', phone: '70 123 45 67', name: 'Fatou Diop' }, password: 'dakar2026' } }));
  check(exp.payout?.network === 'expresso', 'Compte de retrait Expresso accepté (4e opérateur du corridor Bitnob SN)');

  const before = ov.balance.btc.sats;
  const payout = await json(await po({ amount: 2000 }));
  check(payout.status === 'pending' && payout.network === 'wave', `Retrait Wave de 2 000 FCFA créé (${payout.source_amount} sats débités)`);

  // Double dépense : 5 retraits simultanés qui, ensemble, dépassent le solde
  ov = await json(await me('/v1/overview'));
  const each = Math.floor(ov.balance.btc.xof / 3);
  const burst = await Promise.all(Array.from({ length: 5 }, () => po({ amount: each })));
  const accepted = burst.filter((r) => r.status === 201).length;
  ov = await json(await me('/v1/overview'));
  check(accepted <= 3 && ov.balance.btc.sats >= 0, `Double dépense impossible : ${accepted}/5 retraits simultanés acceptés, solde jamais négatif (${ov.balance.btc.sats} sats)`);

  await sleep(3000);
  const list = await json(await me('/v1/payouts'));
  check(list.data.find((p) => p.id === payout.id)?.status === 'completed', 'Retrait confirmé (statut « Reçu »)');
  check(before - payout.source_amount >= 0, 'Registre cohérent après retrait');

  // Un échec signé arrivé après la confirmation ne doit ni changer le statut ni rembourser
  const lateFail = JSON.stringify({ id: 'evt_po_late', event: 'payouts.withdrawal.failed', data: { reference: payout.reference } });
  const lateSig = crypto.createHmac('sha512', BITNOB_WEBHOOK_SECRET).update(lateFail).digest('hex');
  const solde0 = (await json(await me('/v1/overview'))).balance.btc.sats;
  await fetch(`${API}/webhooks/bitnob`, { method: 'POST', headers: { 'x-bitnob-signature': lateSig }, body: lateFail });
  const after = await json(await me('/v1/payouts'));
  const solde1 = (await json(await me('/v1/overview'))).balance.btc.sats;
  check(after.data.find((p) => p.id === payout.id)?.status === 'completed' && solde1 === solde0, 'Échec tardif d’un retrait reçu : ni changement de statut, ni remboursement');

  // ── Épargne en USDT ───────────────────────────────────────────────────────
  check((await json(await me('/v1/savings'))).balance.micro === 0, 'Épargne vide au départ');
  const goal = await json(await me('/v1/savings', { method: 'PATCH', body: { goal_name: 'Tabaski', goal_xof: 300000, pct: 10 } }));
  check(goal.goal.name === 'Tabaski' && goal.pct === 10, 'Objectif « Tabaski » 300 000 FCFA, 10 % de chaque vente');
  check((await me('/v1/savings', { method: 'PATCH', body: { pct: 60 } })).status === 422, 'Épargne automatique plafonnée à 50 %');
  const main0 = (await json(await me('/v1/overview'))).balance.usdt.micro;
  const sv = await json(await me('/v1/savings/deposit', { method: 'POST', body: { amount: 3000 } }));
  const ovS = await json(await me('/v1/overview'));
  check(sv.balance.micro === 5_000_000 && ovS.balance.usdt.micro === main0 - 5_000_000 && ovS.balance.savings.micro === 5_000_000, '3 000 FCFA mis de côté = 5 USDT, sortis du solde disponible');
  check(sv.goal.progress === 1, `Progression de l'objectif : ${sv.goal.progress} %`);
  const tooMuch = await me('/v1/payouts', { method: 'POST', body: { network: 'wave', phone: '77 123 45 67', account_name: 'Fatou Diop', password: 'dakar2026', amount: Math.floor(ovS.balance.usdt.xof + 2000), source_asset: 'USDT' } });
  check(tooMuch.status === 422, 'L’épargne ne peut pas partir en retrait');
  check((await me('/v1/savings/unlock', { method: 'POST', body: { amount: 1200, password: 'faux' } })).status === 401, 'Débloquer l’épargne exige le mot de passe');
  const un = await json(await me('/v1/savings/unlock', { method: 'POST', body: { amount: 1200, password: 'dakar2026' } }));
  check(un.balance.micro === 3_000_000, 'Épargne débloquée : 2 USDT reviennent au solde disponible');
  // Code de retrait : 4 à 6 chiffres, accepté à la place du mot de passe pour retirer ou débloquer l'épargne
  const unlockWith = (password) => me('/v1/savings/unlock', { method: 'POST', body: { amount: 600, password } });
  check((await unlockWith('2468')).status === 401, 'Sans code défini, un code chiffré est refusé');
  check((await me('/v1/merchant', { method: 'PATCH', body: { payout_pin: '1111', password: 'dakar2026' } })).status === 422, 'Code aux chiffres tous identiques refusé (422)');
  check((await me('/v1/merchant', { method: 'PATCH', body: { payout_pin: '2468', password: 'faux' } })).status === 401, 'Définir le code exige le mot de passe du compte');
  const withPin = await json(await me('/v1/merchant', { method: 'PATCH', body: { payout_pin: '2468', password: 'dakar2026' } }));
  check(withPin.has_payout_pin === true && !JSON.stringify(withPin).includes('2468'), 'Code de retrait enregistré (haché, jamais renvoyé)');
  check((await unlockWith('1357')).status === 401, 'Mauvais code de retrait refusé');
  const unPin = await json(await unlockWith('2468'));
  check(unPin.balance.micro === 2_000_000, 'Épargne débloquée avec le code de retrait');
  const saleS = await json(await anon('/v1/public/merchants/fatou/checkouts', { method: 'POST', body: { amount: 20000 } }));
  await fetch(`${API}/v1/checkouts/${saleS.id}/simulate-payment`, { method: 'POST' });
  await sleep(800);
  const auto = await json(await me('/v1/savings'));
  check(auto.balance.micro > 2_000_000 && auto.history.some((h) => h.description.includes('automatique')), `Vente de 20 000 FCFA → ${(auto.balance.micro / 1e6 - 2).toFixed(2)} USDT épargnés automatiquement`);
  await me('/v1/savings', { method: 'PATCH', body: { pct: 0 } });

  // ── Équipe : caissier ─────────────────────────────────────────────────────
  const st = await me('/v1/staff', { method: 'POST', body: { name: 'Moussa', email: 'moussa@test.sn', password: 'caisse2026' } });
  const stj = await json(st);
  check(st.status === 201 && stj.role === 'cashier', 'Caissier « Moussa » ajouté par la propriétaire');
  const cashier = browser();
  const cl = await json(await cashier('/v1/auth/login', { method: 'POST', body: { email: 'moussa@test.sn', password: 'caisse2026' } }));
  check(cl.merchant?.staff?.name === 'Moussa' && cl.merchant.name === 'Boutique Fatou', 'Le caissier se connecte à la caisse de la Boutique Fatou');
  const sale = await cashier('/v1/checkouts', { method: 'POST', body: { amount: 3000, description: 'Vente en caisse' } });
  const salej = await json(sale);
  check(sale.status === 201 && salej.source === 'pos', 'Le caissier encaisse (vente enregistrée comme « Caisse »)');
  const mine = await json(await cashier('/v1/checkouts'));
  check(mine.data.length === 1 && mine.data[0].id === salej.id && mine.stats === null, 'Le caissier ne voit que ses propres ventes, sans statistiques');
  check((await cashier('/v1/overview')).status === 403, 'Le caissier ne voit pas le solde');
  check((await cashier('/v1/payouts', { method: 'POST', body: { amount: 1000 } })).status === 403, 'Le caissier ne peut pas retirer');
  check((await cashier('/v1/staff', { method: 'POST', body: {} })).status === 403, 'Le caissier ne peut pas gérer l’équipe');
  await me(`/v1/staff/${stj.id}`, { method: 'DELETE' });
  check((await cashier('/v1/auth/me')).status === 401, 'Caissier désactivé → déconnecté immédiatement');

  // ── Payer pour un proche ──────────────────────────────────────────────────
  const rel = await json(
    await fetch(`${API}/v1/public/merchants/fatou/checkouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 20000, payer_name: 'Awa', for_name: 'Maman', note: 'Ordonnance' }) }),
  );
  check(rel.description === 'Pour Maman, Ordonnance', `Diaspora : paiement « ${rel.description} »`);

  // ── Retrait automatique ───────────────────────────────────────────────────
  const payoutAccount = { network: 'orange_money', phone: '78 123 45 67', name: 'Fatou Diop' };
  check(
    (await me('/v1/merchant', { method: 'PATCH', body: { payout: payoutAccount } })).status === 401,
    'Changer le compte de retrait sans mot de passe est refusé',
  );
  await me('/v1/merchant', { method: 'PATCH', body: { payout: payoutAccount, password: 'dakar2026' } });
  check(
    (await me('/v1/merchant', { method: 'PATCH', body: { auto_payout: { enabled: true, min_xof: 5000 }, password: 'faux' } })).status === 401,
    'Activation du retrait automatique refusée sans le bon mot de passe',
  );
  const ap = await json(await me('/v1/merchant', { method: 'PATCH', body: { auto_payout: { enabled: true, min_xof: 5000 }, password: 'dakar2026' } }));
  check(ap.auto_payout?.enabled === true, 'Retrait automatique activé (seuil 5 000 FCFA)');
  await fetch(`${API}/v1/checkouts/${rel.id}/simulate-payment`, { method: 'POST' });
  await sleep(1500);
  const autos = (await json(await me('/v1/payouts'))).data.filter((p) => p.trigger === 'auto');
  check(autos.length === 1 && autos[0].network === 'orange_money', `Paiement reçu → retrait automatique de ${autos[0]?.amount} FCFA vers Orange Money`);

  // ── Rapprochement comptable ───────────────────────────────────────────────
  const rec = await json(await me('/v1/reconciliation'));
  check(rec.ok && rec.checked.payments >= 3 && rec.checked.payouts >= 2 && rec.checked.conversions >= 1, `Rapprochement Fatou : ${rec.checked.payments} paiements, ${rec.checked.payouts} retraits, ${rec.checked.conversions} conversions, aucun écart`);
  check((await anon('/v1/reconciliation')).status === 401, 'Rapprochement réservé au marchand connecté');
  const fatouId = (await json(await me('/v1/merchant'))).id;
  const pend = await json(await anon('/v1/public/merchants/fatou/checkouts', { method: 'POST', body: { amount: 1500 } }));
  const db = new PgClient({ connectionString: DB });
  await db.connect();
  await db.query(`INSERT INTO ledger_entries (merchant_id, asset, amount, type, checkout_id, description) VALUES ($1, 'BTC', 999999, 'payment', $2, 'Écriture falsifiée')`, [fatouId, pend.id]);
  const tampered = await json(await me('/v1/reconciliation'));
  check(!tampered.ok && tampered.issues.some((i) => i.code === 'credit_without_payment' && i.ref === pend.id), 'Écriture falsifiée (crédit sans paiement) détectée par le rapprochement');
  await db.query(`DELETE FROM ledger_entries WHERE checkout_id = $1`, [pend.id]);
  await db.end();
  check((await json(await me('/v1/reconciliation'))).ok, 'Après correction : rapprochement de nouveau sans écart');

  // ── Application mobile : jeton de session (Bearer ymb_…) ──────────────────
  const ml = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fatou@test.sn', password: 'dakar2026', client: 'mobile' }) });
  const mlj = await json(ml);
  check(ml.status === 200 && mlj.token?.startsWith('ymb_') && !ml.headers.get('set-cookie'), 'Connexion mobile : jeton renvoyé, aucun cookie posé');
  const mob = (path, opts = {}) => fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mlj.token}` }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  check((await json(await mob('/v1/overview'))).merchant?.username === 'fatou', 'Jeton mobile : accès au tableau de bord');
  check((await mob('/v1/payment-links', { method: 'POST', body: { amount: 2500, description: 'Depuis le mobile' } })).status === 201, 'Jeton mobile : écriture sans en-tête CSRF (pas de cookie, pas de risque CSRF)');
  check((await mob('/v1/savings/unlock', { method: 'POST', body: { amount: 600, password: 'faux' } })).status === 401, 'Jeton mobile : les actions sensibles exigent toujours le mot de passe');
  check((await fetch(`${API}/v1/overview`, { headers: { Authorization: 'Bearer ymb_jeton_invente' } })).status === 401, 'Jeton mobile inventé refusé');
  await mob('/v1/auth/logout', { method: 'POST' });
  check((await mob('/v1/auth/me')).status === 401, 'Déconnexion mobile : le jeton ne fonctionne plus');

  // ── Session ───────────────────────────────────────────────────────────────
  const login = browser();
  check((await login('/v1/auth/login', { method: 'POST', body: { email: 'fatou@test.sn', password: 'faux' } })).status === 401, 'Connexion refusée avec un mauvais mot de passe');
  check((await login('/v1/auth/login', { method: 'POST', body: { email: 'fatou@test.sn', password: 'dakar2026' } })).status === 200, 'Connexion réussie (cookie HttpOnly)');
  await login('/v1/auth/logout', { method: 'POST' });
  check((await login('/v1/overview')).status === 401, 'Après déconnexion, la session est invalidée côté serveur');

  // ── Lien de paiement et pages ─────────────────────────────────────────────
  const link = await json(await fetch(`${API}/v1/payment-links`, { method: 'POST', headers: K, body: JSON.stringify({ amount: 10000, description: 'Robe' }) }));
  const go = await fetch(link.url, { redirect: 'manual' });
  check(go.status === 302 && go.headers.get('location').startsWith('/pay/chk_'), 'Lien de paiement → nouvelle page de paiement');

  for (const p of ['/', '/login', '/signup', '/app', '/app/caisse', `/pay/${id}`, `/recu/${id}`, '/@fatou', '/docs', '/sdk/yombalpay.js', '/manifest.webmanifest']) {
    check((await fetch(API + p)).status === 200, `GET ${p}`);
  }
  const headers = (await fetch(`${API}/`)).headers;
  check(/frame-ancestors 'none'/.test(headers.get('content-security-policy') || ''), 'En-têtes de sécurité : CSP + anti-clickjacking');
} catch (e) {
  console.error(e);
  console.error(serverLog.slice(-2000));
  failures++;
} finally {
  procs.forEach((p) => p.kill());
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert ✔');
  process.exit(failures ? 1 : 0);
}
