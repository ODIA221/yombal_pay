// API v1 : paiements (clé API ou session), espace marchand (session), pages publiques.
import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, many, query } from '../db/pool.js';
import { bitnob } from '../lib/bitnob.js';
import { authenticate, optionalAuth } from '../lib/auth.js';
import { subscribe } from '../lib/bus.js';
import { getXofPerBtc } from '../lib/rates.js';
import { newId } from '../lib/ids.js';
import { createApiKey, emailTaken, listApiKeys, merchantByUsername, merchantView, revokeApiKey, lightningAddress } from '../lib/merchants.js';
import { listDeliveries, retryDelivery } from '../lib/notifier.js';
import { balancesView, convertToUsdt, listConversions, listLedger, stats } from '../lib/ledger.js';
import { corridorStatus, createPayout, listPayouts, NETWORKS, normalizeSnPhone, publicPayout } from '../lib/payouts.js';
import {
  canSimulate,
  createCheckout,
  getCheckout,
  markPaid,
  listCheckouts,
  privateCheckout,
  publicCheckout,
  refreshFromBitnob,
  validateAmountXof,
  MIN_XOF,
  MAX_XOF,
} from '../lib/payments.js';
import { assertSafeWebhookUrl, audit, hashPassword, randomToken, rateLimit, verifyPassword } from '../lib/security.js';
import { processBitnobEvent } from './webhooks.js';
import { depositAddress } from '../lib/stablecoins.js';
import { saveXof, savingsView, unlock } from '../lib/savings.js';
import { reconcileMerchant } from '../lib/reconciliation.js';
import { isAdmin, LEGAL_FORMS, listVerifications, reviewVerification, SECTORS, submitVerification, verificationView } from '../lib/verification.js';

export const api = express.Router();
api.use(express.json({ limit: '100kb' }));

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const merchantOnly = authenticate(['session', 'secret_key']);
const sessionOnly = authenticate(['session']);

// Sortie d'argent (retrait, déblocage d'épargne) : mot de passe du compte, ou code de retrait à 4-6 chiffres s'il est défini.
// Un mot de passe contient toujours une lettre : une saisie uniquement en chiffres est donc forcément un code.
async function confirmWithdrawal(merchant, secret) {
  const s = String(secret || '');
  if (/^\d{4,6}$/.test(s)) return Boolean(merchant.payout_pin_hash) && verifyPassword(s, merchant.payout_pin_hash);
  return verifyPassword(s, merchant.password_hash);
}
const WRONG_SECRET = 'Code de retrait ou mot de passe incorrect.';

// Après 5 échecs en une heure (retrait ou déblocage d'épargne), les sorties d'argent sont bloquées une heure :
// un code à 4 chiffres ne peut plus être deviné par essais successifs (journal d'audit : vaut après redémarrage).
const WITHDRAWAL_FAILURES = ['payout_password_failed', 'savings_unlock_password_failed'];
async function withdrawalLocked(merchantId) {
  const r = await one(
    `SELECT count(*)::int AS n FROM audit_log WHERE merchant_id = $1 AND action = ANY($2) AND created_at > now() - interval '1 hour'`,
    [merchantId, WITHDRAWAL_FAILURES],
  );
  return r.n >= 5;
}
const LOCKED = 'Trop d’essais de code ou de mot de passe : retraits et déblocage d’épargne bloqués pendant une heure.';

// Les détails d'une erreur Bitnob (IP non autorisée, compte inactif…) restent dans les journaux du serveur
// et dans l'espace du marchand. Le client final ne voit qu'un message simple.
const PAYMENT_DOWN = 'Le paiement est momentanément indisponible. Réessayez dans quelques instants.';
function bitnobFail(res, e, { showDetail = false } = {}) {
  console.error('Bitnob :', e.message);
  return fail(res, 502, 'bitnob_error', showDetail ? e.message : PAYMENT_DOWN);
}

// ── Santé & taux ────────────────────────────────────────────────────────────
api.get('/health', wrap(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, mode: config.demoMode ? 'demo' : 'live', database: 'ok', public_url: config.publicUrl, time: new Date().toISOString() });
}));

api.get('/rates', wrap(async (req, res) => {
  const r = await getXofPerBtc({ force: req.query.force === '1' });
  res.json({
    xof_per_btc: Math.round(r.xofPerBtc),
    xof_per_sat: r.xofPerBtc / 1e8,
    sats_per_1000_xof: Math.round((1000 / r.xofPerBtc) * 1e8),
    usd_xof: config.rates.usdToXof,
    source: r.source,
    fixed: r.fixed,
    fetched_at: new Date(r.fetchedAt).toISOString(),
  });
}));

// ── Paiements ───────────────────────────────────────────────────────────────
// POST /v1/checkouts : clé secrète (serveur), clé publique pk_… (bouton navigateur) ou session (caisse)
api.post(
  '/checkouts',
  rateLimit({ name: 'checkout', limit: 120, windowMs: 60_000 }),
  authenticate(['session', 'staff', 'secret_key', 'publishable_key']),
  wrap(async (req, res) => {
    const body = req.body || {};
    const currency = String(body.currency || 'XOF').toUpperCase();
    if (!['XOF', 'FCFA', 'CFA'].includes(currency)) return fail(res, 422, 'invalid_currency', 'Seule la devise XOF (FCFA) est prise en charge.');
    const err = validateAmountXof(body.amount);
    if (err) return fail(res, 422, 'invalid_amount', err);

    const input = {
      amount: body.amount,
      reference: body.reference,
      description: body.description,
      return_url: body.return_url,
      customer_email: body.customer_email,
      metadata: body.metadata,
      // « button » : clé publique (bouton navigateur), ses références ne recouvrent jamais celles du marchand
      source:
        req.authVia === 'staff' ? 'pos'
        : req.authVia === 'session' ? (body.source === 'pos' ? 'pos' : 'dashboard')
        : req.authVia === 'publishable_key' ? 'button'
        : 'api',
      staff_id: req.staff?.id,
    };
    // Une clé publique ne peut pas rediriger les notifications
    if (req.authVia === 'secret_key' && body.webhook_url) input.webhook_url = await assertSafeWebhookUrl(body.webhook_url).catch((e) => {
      throw Object.assign(e, { status: 422 });
    });
    try {
      const { checkout, created } = await createCheckout(req.merchant, input);
      res.status(created ? 201 : 200).json(publicCheckout(checkout));
    } catch (e) {
      if (e.status) return fail(res, e.status, e.code || 'invalid_request', e.message);
      bitnobFail(res, e, { showDetail: req.authVia === 'session' || req.authVia === 'staff' });
    }
  }),
);

api.get('/checkouts', authenticate(['session', 'secret_key', 'staff']), wrap(async (req, res) => {
  const list = await listCheckouts(req.merchant.id, { status: req.query.status, limit: req.query.limit, q: req.query.q, staffId: req.staff?.id });
  res.json({ data: list.map(req.staff ? publicCheckout : privateCheckout), stats: req.staff ? null : await stats(req.merchant.id) });
}));

api.get('/checkouts/:id', optionalAuth, wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  const own = Boolean(req.merchant && c?.merchant_id === req.merchant.id);
  // Clé API d'un autre marchand : introuvable (isolation). Un marchand connecté dans son navigateur qui ouvre
  // la page de paiement d'un autre (pour payer, ou tester la boutique de démo) reçoit la vue publique.
  if (!c || (req.authVia === 'secret_key' && !own)) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  // Bouton « Simuler » d'une facture sandbox : seulement pour le marchand propriétaire
  res.json({ ...(own ? privateCheckout(c) : publicCheckout(c)), ...(own && !c.demo ? { can_simulate: canSimulate(c) } : {}) });
}));

// Flux temps réel du statut (page de paiement)
api.get('/checkouts/:id/stream', wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  if (subscribe(`checkout:${c.id}`, req, res)) res.write(`event: status\ndata: ${JSON.stringify(publicCheckout(c))}\n\n`);
}));

// Vérification serveur à la demande (bouton « J'ai payé » / secours si le webhook n'arrive pas)
api.post('/checkouts/:id/refresh', rateLimit({ name: 'refresh', limit: 20, windowMs: 60_000 }), wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  try {
    await refreshFromBitnob(c);
  } catch (e) {
    return bitnobFail(res, e);
  }
  res.json(publicCheckout(await getCheckout(c.id)));
}));

// Paiement en USDT / USDC : adresse de dépôt Bitnob propre à ce paiement, sur le réseau choisi par le client
api.post('/checkouts/:id/usdt', rateLimit({ name: 'usdt-address', limit: 10, windowMs: 600_000 }), wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  try {
    await depositAddress(c, String(req.body?.chain || '').toLowerCase());
  } catch (e) {
    if (e.status) return fail(res, e.status, 'usdt_unavailable', e.message);
    return bitnobFail(res, e);
  }
  res.status(201).json(publicCheckout(await getCheckout(c.id)));
}));

// Mode démo : simule le webhook Bitnob (même chemin de code que le vrai webhook)
api.post('/checkouts/:id/simulate-payment', optionalAuth, wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  // Facture Bitnob : simulable seulement en sandbox confirmée, facture de test (lntb…) et YOMBAL_TEST_HELPERS=true.
  // Le portefeuille sandbox de Bitnob ne paie pas les factures Lightning : on confirme comme un vrai paiement
  // (registre, notification du site marchand, temps réel), sans passer par Bitnob.
  if (!c.demo) {
    // Sinon, n'importe qui ayant le lien pourrait faire passer une commande d'un site marchand pour payée
    if (c.merchant_id !== req.merchant?.id) return fail(res, 403, 'owner_only', 'Simulation réservée au marchand propriétaire du paiement (connecté).');
    if (!canSimulate(c)) {
      return config.demoMode
        ? fail(res, 403, 'live_checkout', 'Ce paiement est réel : il ne peut pas être simulé.')
        : fail(res, 403, 'live_mode', 'Simulation réservée aux factures de test, en sandbox Bitnob avec YOMBAL_TEST_HELPERS=true.');
    }
    if (req.body?.asset === 'USDT') return fail(res, 422, 'usdt_sandbox', 'Simulation USDT disponible en mode démo seulement.');
    await markPaid(c.id, { by: 'sandbox_simulation' });
    return res.json({ simulated: true, checkout: publicCheckout(await getCheckout(c.id)) });
  }
  if (!config.demoMode) return fail(res, 403, 'live_mode', 'Simulation désactivée en mode réel.');
  // Dépôt USDT simulé sur la dernière adresse demandée (montant exact attendu)
  const addr = req.body?.asset === 'USDT' ? c.usdt_addresses?.at(-1) : null;
  if (req.body?.asset === 'USDT') {
    if (!addr) return fail(res, 422, 'no_address', 'Choisissez d’abord un réseau USDT.');
    const id = newId('bn_dep');
    const result = await processBitnobEvent(
      { event: 'deposit.success', event_id: id, transaction_id: id, address: addr.address, chain: addr.chain, currency: 'USDT', amount: String(c.usdt_amount_micro), hash: crypto.randomBytes(32).toString('hex') },
      { verified: true },
    );
    return res.json({ simulated: true, result, checkout: publicCheckout(await getCheckout(c.id)) });
  }
  const event = {
    id: newId('bn_evt'),
    event: 'transfer.success',
    data: { id: c.invoice_id, reference: c.bitnob_reference, payment_hash: c.payment_hash, amount: String(c.amount_sats), status: 'paid', preimage: crypto.randomBytes(32).toString('hex') },
  };
  const result = await processBitnobEvent(event, { verified: true });
  res.json({ simulated: true, result, checkout: publicCheckout(await getCheckout(c.id)) });
}));

// ── Pages publiques du marchand : /@username ─────────────────────────────────
api.get('/public/merchants/:username', wrap(async (req, res) => {
  const m = await merchantByUsername(req.params.username);
  if (!m) return fail(res, 404, 'not_found', 'Marchand introuvable.');
  res.json({ name: m.name, username: m.username, lightning_address: lightningAddress(m), min: MIN_XOF, max: MAX_XOF, demo: config.demoMode,
    savings: { benchmark_bps: config.savingsBenchmarkBps, fee_bps: m.fee_bps ?? config.feeBps },
  });
}));

api.post(
  '/public/merchants/:username/checkouts',
  rateLimit({ name: 'public-checkout', limit: 20, windowMs: 600_000 }),
  wrap(async (req, res) => {
    const m = await merchantByUsername(req.params.username);
    if (!m) return fail(res, 404, 'not_found', 'Marchand introuvable.');
    const err = validateAmountXof(req.body?.amount);
    if (err) return fail(res, 422, 'invalid_amount', err);
    const note = String(req.body?.note || '').trim().slice(0, 140);
    const payer = String(req.body?.payer_name || '').trim().slice(0, 60);
    const forName = String(req.body?.for_name || '').trim().slice(0, 60);
    try {
      const { checkout } = await createCheckout(m, {
        amount: req.body.amount,
        description: forName ? `Pour ${forName}${note ? `, ${note}` : ''}` : note || `Paiement à ${m.name}`,
        payer_note: [payer && `De ${payer}`, forName && `pour ${forName}`, note].filter(Boolean).join(', ') || null,
        source: 'public_page',
      });
      res.status(201).json(publicCheckout(checkout));
    } catch (e) {
      if (e.status === 403) return fail(res, 403, e.code, `${m.name} ne peut pas encore recevoir de paiements.`);
      bitnobFail(res, e);
    }
  }),
);

// ── Vérification de l'entreprise (KYB) ──────────────────────────────────────
api.get('/verification', sessionOnly, (req, res) => res.json({ ...verificationView(req.merchant), legal_forms: LEGAL_FORMS, sectors: SECTORS }));

api.post('/verification', sessionOnly, rateLimit({ name: 'verification', limit: 10, windowMs: 3_600_000, key: (req) => req.merchant.id }), wrap(async (req, res) => {
  try {
    const r = await submitVerification(req.merchant, req.body || {});
    if (r.errors) return res.status(422).json({ error: { code: 'invalid_verification', message: 'Certaines informations sont à corriger.', fields: r.errors } });
    await audit(req.merchant.id, 'verification_submitted', req);
    res.status(201).json(verificationView(r.merchant));
  } catch (e) {
    if (e.status) return fail(res, e.status, e.code, e.message);
    throw e;
  }
}));

// ── Administration YombalPay : validation des entreprises (ADMIN_EMAILS) ────
const adminOnly = (req, res, next) => (isAdmin(req.merchant) ? next() : fail(res, 403, 'forbidden', 'Accès réservé aux administrateurs YombalPay.'));

api.get('/admin/verifications', sessionOnly, adminOnly, wrap(async (req, res) => {
  const status = ['pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  res.json({ data: await listVerifications(status) });
}));

api.post('/admin/verifications/:id', sessionOnly, adminOnly, wrap(async (req, res) => {
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) return fail(res, 422, 'invalid_decision', 'decision doit valoir approve ou reject.');
  const m = await reviewVerification(req.params.id, decision === 'approve', req.body?.note);
  if (!m) return fail(res, 404, 'not_found', 'Aucune demande en attente pour ce marchand.');
  await audit(m.id, decision === 'approve' ? 'verification_approved' : 'verification_rejected', req, { admin: req.merchant.email });
  res.json({ id: m.id, status: m.verification_status, note: m.verification_note });
}));

// ── Liens de paiement (partage WhatsApp) ────────────────────────────────────
api.get('/payment-links', merchantOnly, wrap(async (req, res) => {
  const rows = await many('SELECT * FROM payment_links WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 100', [req.merchant.id]);
  res.json({ data: rows.map((l) => ({ ...l, amount: l.amount_xof, url: `${config.publicUrl}/l/${l.slug}` })) });
}));

api.post('/payment-links', merchantOnly, wrap(async (req, res) => {
  const err = validateAmountXof(req.body?.amount);
  if (err) return fail(res, 422, 'invalid_amount', err);
  const l = await one(
    `INSERT INTO payment_links (id, slug, merchant_id, amount_xof, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [newId('lnk'), randomToken(6), req.merchant.id, Math.round(Number(req.body.amount)), String(req.body.description || 'Paiement').trim().slice(0, 120) || 'Paiement'],
  );
  res.status(201).json({ ...l, amount: l.amount_xof, url: `${config.publicUrl}/l/${l.slug}` });
}));

api.patch('/payment-links/:id', merchantOnly, wrap(async (req, res) => {
  const l = await one('UPDATE payment_links SET active = $3 WHERE id = $1 AND merchant_id = $2 RETURNING *', [req.params.id, req.merchant.id, Boolean(req.body?.active)]);
  if (!l) return fail(res, 404, 'not_found', 'Lien introuvable.');
  res.json({ ...l, amount: l.amount_xof, url: `${config.publicUrl}/l/${l.slug}` });
}));

// ── Marchand ────────────────────────────────────────────────────────────────
api.get('/merchant', merchantOnly, (req, res) => res.json(merchantView(req.merchant)));

api.patch('/merchant', sessionOnly, rateLimit({ name: 'merchant-update', limit: 30, windowMs: 600_000, key: (req) => req.merchant.id }), wrap(async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const vals = [req.merchant.id];
  const set = (col, v) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (typeof b.name === 'string') {
    if (b.name.trim().length < 2) return fail(res, 422, 'invalid_name', 'Nom trop court.');
    set('name', b.name.trim().slice(0, 60));
  }
  if (b.webhook_url !== undefined) {
    if (!b.webhook_url) set('webhook_url', null);
    else {
      try {
        set('webhook_url', await assertSafeWebhookUrl(b.webhook_url));
      } catch (e) {
        return fail(res, 422, 'invalid_webhook', e.message);
      }
    }
  }
  if (b.auto_convert_pct !== undefined) {
    const p = Math.round(Number(b.auto_convert_pct));
    if (!(p >= 0 && p <= 100)) return fail(res, 422, 'invalid_pct', 'Pourcentage entre 0 et 100.');
    if (p + (req.merchant.savings_pct || 0) > 100) return fail(res, 422, 'invalid_pct', 'Protection USDT + épargne automatique : 100 % maximum.');
    set('auto_convert_pct', p);
  }
  if (b.payout !== undefined) {
    if (b.payout === null) {
      set('payout_network', null);
      set('payout_phone', null);
      set('payout_name', null);
    } else {
      const phone = normalizeSnPhone(b.payout.phone);
      if (!NETWORKS[b.payout.network] || !phone) return fail(res, 422, 'invalid_payout', 'Réseau ou numéro invalide.');
      // Le retrait automatique part vers ce compte : le changer exige le mot de passe, comme un retrait
      if (!(await verifyPassword(String(b.password || ''), req.merchant.password_hash))) {
        await audit(req.merchant.id, 'payout_account_password_failed', req);
        return fail(res, 401, 'invalid_password', 'Mot de passe incorrect.');
      }
      set('payout_network', b.payout.network);
      set('payout_phone', phone);
      set('payout_name', String(b.payout.name || '').trim().slice(0, 80) || req.merchant.name);
    }
  }
  if (b.payout_pin !== undefined) {
    // Définir ou retirer le code de retrait : toujours le mot de passe du compte (jamais l'ancien code)
    if (!(await verifyPassword(String(b.password || ''), req.merchant.password_hash))) {
      await audit(req.merchant.id, 'payout_pin_password_failed', req);
      return fail(res, 401, 'invalid_password', 'Mot de passe incorrect.');
    }
    if (b.payout_pin === null || b.payout_pin === '') set('payout_pin_hash', null);
    else {
      const pin = String(b.payout_pin);
      if (!/^\d{4,6}$/.test(pin)) return fail(res, 422, 'invalid_pin', 'Code de retrait : 4 à 6 chiffres.');
      if (/^(\d)\1+$/.test(pin)) return fail(res, 422, 'invalid_pin', 'Code trop simple : évitez les chiffres tous identiques.');
      set('payout_pin_hash', await hashPassword(pin));
    }
  }
  if (b.phone !== undefined) set('phone', String(b.phone || '').slice(0, 30) || null);
  if (b.auto_payout !== undefined) {
    const enabled = Boolean(b.auto_payout?.enabled);
    const min = Math.round(Number(b.auto_payout?.min_xof ?? req.merchant.auto_payout_min_xof));
    if (!(min >= config.payouts.minXof && min <= config.payouts.dailyMaxXof))
      return fail(res, 422, 'invalid_threshold', `Seuil entre ${config.payouts.minXof} et ${config.payouts.dailyMaxXof.toLocaleString('fr-FR')} FCFA.`);
    if (enabled) {
      if (!(await verifyPassword(String(b.password || ''), req.merchant.password_hash)))
        return fail(res, 401, 'invalid_password', 'Mot de passe incorrect.');
      if (!req.merchant.payout_network && !b.payout) return fail(res, 422, 'no_payout_account', "Enregistrez d'abord un compte de retrait par défaut.");
    }
    set('auto_payout_enabled', enabled);
    set('auto_payout_min_xof', min);
  }
  if (!sets.length) return res.json(merchantView(req.merchant));
  const m = await one(`UPDATE merchants SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
  const action =
    b.auto_payout !== undefined ? (m.auto_payout_enabled ? 'auto_payout_enabled' : 'auto_payout_disabled')
    : b.payout ? 'payout_account_changed'
    : b.payout_pin !== undefined ? (m.payout_pin_hash ? 'payout_pin_set' : 'payout_pin_removed')
    : 'settings_updated';
  await audit(m.id, action, req, {
    fields: Object.keys(b).filter((k) => k !== 'password' && k !== 'payout_pin'),
  });
  res.json(merchantView(m));
}));

// Flux temps réel du marchand (cookie de session, même origine)
api.get('/merchant/stream', sessionOnly, (req, res) => subscribe(`merchant:${req.merchant.id}`, req, res));

// Vue d'ensemble du tableau de bord
api.get('/overview', merchantOnly, wrap(async (req, res) => {
  const [balance, s, recent] = await Promise.all([balancesView(req.merchant.id), stats(req.merchant.id), listCheckouts(req.merchant.id, { limit: 8 })]);
  res.json({ merchant: merchantView(req.merchant), balance, stats: s, recent: recent.map(privateCheckout) });
}));

api.get('/ledger', merchantOnly, wrap(async (req, res) => res.json({ data: await listLedger(req.merchant.id, 100) })));

// ── Notifications webhook ───────────────────────────────────────────────────
api.get('/deliveries', merchantOnly, wrap(async (req, res) => res.json({ data: await listDeliveries(req.merchant.id) })));

api.post('/deliveries/:id/retry', merchantOnly, wrap(async (req, res) => {
  if (!(await retryDelivery(req.merchant.id, req.params.id))) return fail(res, 404, 'not_found', 'Notification introuvable.');
  res.json({ ok: true });
}));

// ── Protection contre la volatilité : BTC → USDT ────────────────────────────
api.get('/conversions', merchantOnly, wrap(async (req, res) => {
  const rows = await listConversions(req.merchant.id);
  res.json({ data: rows.map((c) => ({ ...c, usdt: (c.usdt_micro / 1e6).toFixed(2) })) });
}));

api.post('/conversions', sessionOnly, rateLimit({ name: 'convert', limit: 20, windowMs: 600_000 }), wrap(async (req, res) => {
  try {
    const r = await convertToUsdt(req.merchant.id, req.body?.sats);
    await audit(req.merchant.id, 'conversion', req, { sats: r.sats, usdt: r.usdt });
    res.status(201).json({ ...r, balance: await balancesView(req.merchant.id) });
  } catch (e) {
    fail(res, e.status || 502, e.status ? 'invalid_request' : 'bitnob_error', e.message);
  }
}));

// ── Épargne en USDT (propriétaire uniquement) ───────────────────────────────
api.get('/savings', sessionOnly, wrap(async (req, res) => res.json(await savingsView(req.merchant))));

api.patch('/savings', sessionOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const m = req.merchant;
  const pct = b.pct === undefined ? m.savings_pct : Math.round(Number(b.pct));
  if (!(pct >= 0 && pct <= 50)) return fail(res, 422, 'invalid_pct', 'Épargne automatique : entre 0 et 50 % de chaque vente.');
  if (pct + (m.auto_convert_pct || 0) > 100) return fail(res, 422, 'invalid_pct', 'Protection USDT + épargne automatique : 100 % maximum.');
  const goalXof = b.goal_xof === undefined ? m.savings_goal_xof : b.goal_xof ? Math.round(Number(b.goal_xof)) : null;
  if (goalXof !== null && !(goalXof >= 1000 && goalXof <= 100_000_000)) return fail(res, 422, 'invalid_goal', 'Objectif entre 1 000 et 100 000 000 FCFA.');
  const name = b.goal_name === undefined ? m.savings_goal_name : String(b.goal_name || '').trim().slice(0, 40) || null;
  const updated = await one(
    'UPDATE merchants SET savings_pct = $2, savings_goal_xof = $3, savings_goal_name = $4 WHERE id = $1 RETURNING *',
    [m.id, pct, goalXof, name],
  );
  await audit(m.id, 'savings_settings', req, { pct, goal_xof: goalXof });
  res.json(await savingsView(updated));
}));

api.post('/savings/deposit', sessionOnly, rateLimit({ name: 'savings', limit: 20, windowMs: 600_000, key: (req) => req.merchant.id }), wrap(async (req, res) => {
  try {
    await saveXof(req.merchant, req.body?.amount);
  } catch (e) {
    return fail(res, e.status || 502, e.status ? 'invalid_request' : 'bitnob_error', e.message);
  }
  await audit(req.merchant.id, 'savings_deposit', req, { amount: req.body?.amount });
  res.status(201).json(await savingsView(req.merchant));
}));

// Débloquer l'épargne : mot de passe exigé, comme un retrait
api.post('/savings/unlock', sessionOnly, rateLimit({ name: 'savings-unlock', limit: 10, windowMs: 600_000, key: (req) => req.merchant.id }), wrap(async (req, res) => {
  if (await withdrawalLocked(req.merchant.id)) return fail(res, 429, 'too_many_attempts', LOCKED);
  if (!(await confirmWithdrawal(req.merchant, req.body?.password))) {
    await audit(req.merchant.id, 'savings_unlock_password_failed', req);
    return fail(res, 401, 'invalid_password', WRONG_SECRET);
  }
  try {
    await unlock(req.merchant, req.body?.amount);
  } catch (e) {
    return fail(res, e.status || 500, 'invalid_request', e.message);
  }
  await audit(req.merchant.id, 'savings_unlock', req, { amount: req.body?.amount ?? 'tout' });
  res.json(await savingsView(req.merchant));
}));

// ── Retraits mobile money ───────────────────────────────────────────────────
api.get('/payouts', merchantOnly, wrap(async (req, res) => {
  res.json({ data: (await listPayouts(req.merchant.id)).map(publicPayout), networks: Object.entries(NETWORKS).map(([id, n]) => ({ id, label: n.label })) });
}));

api.get('/payouts/corridor', merchantOnly, wrap(async (_req, res) => res.json(await corridorStatus())));

// Retrait : session + confirmation par mot de passe (jamais par simple clé API)
api.post('/payouts', sessionOnly, rateLimit({ name: 'payout', limit: 10, windowMs: 600_000, key: (req) => req.merchant.id }), wrap(async (req, res) => {
  const b = req.body || {};
  if (await withdrawalLocked(req.merchant.id)) return fail(res, 429, 'too_many_attempts', LOCKED);
  if (!(await confirmWithdrawal(req.merchant, b.password))) {
    await audit(req.merchant.id, 'payout_password_failed', req);
    return fail(res, 401, 'invalid_password', WRONG_SECRET);
  }
  try {
    const p = await createPayout(req.merchant, {
      amount: b.amount,
      network: b.network,
      phone: b.phone,
      accountName: b.account_name,
      sourceAsset: b.source_asset || 'BTC',
    });
    await audit(req.merchant.id, 'payout_created', req, { payout: p.id, amount: p.amount_xof, network: p.network });
    res.status(201).json(publicPayout(p));
  } catch (e) {
    fail(res, e.status || 502, e.status ? 'invalid_request' : 'payout_error', e.message);
  }
}));

// ── Équipe : comptes caissiers (accès caisse + leurs ventes uniquement) ─────
const staffView = (s) => ({ id: s.id, name: s.name, email: s.email, role: s.role, created_at: s.created_at, active: !s.disabled_at });

api.get('/staff', sessionOnly, wrap(async (req, res) => {
  const rows = await many('SELECT * FROM staff WHERE merchant_id = $1 ORDER BY created_at DESC', [req.merchant.id]);
  res.json({ data: rows.map(staffView) });
}));

api.post('/staff', sessionOnly, rateLimit({ name: 'staff', limit: 20, windowMs: 3_600_000 }), wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (name.length < 2) return fail(res, 422, 'invalid_name', 'Indiquez le nom du caissier.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(res, 422, 'invalid_email', 'Adresse e-mail invalide.');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return fail(res, 422, 'weak_password', 'Mot de passe : 8 caractères minimum, avec une lettre et un chiffre.');
  if (await emailTaken(email)) return fail(res, 409, 'email_taken', 'Cet e-mail est déjà utilisé.');
  const row = await one(
    'INSERT INTO staff (id, merchant_id, name, email, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [newId('stf'), req.merchant.id, name, email, await hashPassword(password)],
  );
  await audit(req.merchant.id, 'staff_created', req, { staff: row.id, name });
  res.status(201).json(staffView(row));
}));

api.delete('/staff/:id', sessionOnly, wrap(async (req, res) => {
  const row = await one('UPDATE staff SET disabled_at = now() WHERE id = $1 AND merchant_id = $2 AND disabled_at IS NULL RETURNING *', [req.params.id, req.merchant.id]);
  if (!row) return fail(res, 404, 'not_found', 'Caissier introuvable.');
  await query('DELETE FROM sessions WHERE staff_id = $1', [row.id]); // déconnexion immédiate
  await audit(req.merchant.id, 'staff_disabled', req, { staff: row.id, name: row.name });
  res.json({ ok: true });
}));

// ── Clés API & secret webhook ───────────────────────────────────────────────
api.get('/api-keys', sessionOnly, wrap(async (req, res) => res.json({ data: await listApiKeys(req.merchant.id) })));

api.post('/api-keys', sessionOnly, rateLimit({ name: 'apikey', limit: 10, windowMs: 3_600_000 }), wrap(async (req, res) => {
  const k = await createApiKey(req.merchant.id, String(req.body?.label || 'Clé secrète'));
  await audit(req.merchant.id, 'api_key_created', req, { key: k.id });
  res.status(201).json(k);
}));

api.delete('/api-keys/:id', sessionOnly, wrap(async (req, res) => {
  if (!(await revokeApiKey(req.merchant.id, req.params.id))) return fail(res, 404, 'not_found', 'Clé introuvable.');
  await audit(req.merchant.id, 'api_key_revoked', req, { key: req.params.id });
  res.json({ ok: true });
}));

api.get('/webhook-secret', sessionOnly, (req, res) => res.json({ webhook_secret: req.merchant.webhook_secret }));

api.post('/webhook-secret/rotate', sessionOnly, wrap(async (req, res) => {
  const m = await one('UPDATE merchants SET webhook_secret = $2 WHERE id = $1 RETURNING webhook_secret', [req.merchant.id, `whsec_${randomToken(24)}`]);
  await audit(req.merchant.id, 'webhook_secret_rotated', req);
  res.json(m);
}));

api.get('/audit', sessionOnly, wrap(async (req, res) => {
  res.json({ data: await many('SELECT action, ip, meta, created_at FROM audit_log WHERE merchant_id = $1 ORDER BY id DESC LIMIT 50', [req.merchant.id]) });
}));

// Rapprochement comptable du marchand : registre ↔ paiements, dépôts, retraits, conversions
api.get('/reconciliation', sessionOnly, wrap(async (req, res) => res.json(await reconcileMerchant(req.merchant.id))));

// Diagnostic de la connexion Bitnob (utile le jour J)
api.get('/bitnob/whoami', sessionOnly, wrap(async (_req, res) => {
  if (config.demoMode) return res.json({ mode: 'demo', message: 'Aucune clé Bitnob configurée.' });
  try {
    res.json({ mode: 'live', whoami: await bitnob.whoami() });
  } catch (e) {
    fail(res, 502, 'bitnob_error', e.message);
  }
}));
