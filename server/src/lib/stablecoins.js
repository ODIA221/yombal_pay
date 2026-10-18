// Paiement en stablecoins (USDT / USDC) : une adresse de dépôt Bitnob par paiement et par réseau,
// puis webhook deposit.success signé, reconfirmé par GET /api/transactions/:id avant de créditer.
// Chaque dépôt est crédité dès son arrivée ; le paiement passe à « Payé » quand le total atteint le montant attendu.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, tx } from '../db/pool.js';
import { bitnob } from './bitnob.js';
import { publish } from './bus.js';
import { creditDeposit } from './ledger.js';
import { getCheckout, markPaid, publicCheckout, usdtExpectedMicro } from './payments.js';

const err = (message, status = 422) => Object.assign(new Error(message), { status });

// Adresse factice au bon format (mode démo uniquement)
function demoAddress(chain) {
  const b58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const rand = (n) => Array.from(crypto.randomBytes(n), (b) => b58[b % 58]).join('');
  if (chain === 'tron') return `T${rand(33)}`;
  if (chain === 'solana') return rand(44);
  return `0x${crypto.randomBytes(20).toString('hex')}`;
}

// Adresse de dépôt pour ce paiement sur ce réseau (idempotent : la même adresse est renvoyée)
export async function depositAddress(c, chain) {
  if (!config.usdt.chains.includes(chain)) throw err('Réseau non proposé.');
  if (c.status !== 'pending') throw err('Ce paiement n’est plus en attente.', 409);
  const expected = c.usdt_amount_micro ?? usdtExpectedMicro(c.amount_xof);
  if (expected < config.usdt.minUsdt * 1e6) throw err(`Paiement en USDT possible à partir de ${config.usdt.minUsdt} USDT.`);

  const existing = await one('SELECT address FROM checkout_addresses WHERE checkout_id = $1 AND chain = $2', [c.id, chain]);
  if (existing) return existing.address;

  let address;
  let bitnobId = null;
  if (c.demo) {
    address = demoAddress(chain);
  } else {
    const a = await bitnob.createAddress({ chain, label: `YombalPay ${c.id}`, reference: `${c.bitnob_reference}_${chain}` });
    address = a.address;
    bitnobId = a.id ?? null;
    if (!address) throw new Error('Bitnob n’a pas renvoyé d’adresse de dépôt.');
  }
  await tx(async (client) => {
    // Le montant USDT est figé à la première adresse demandée
    await client.query('UPDATE checkouts SET usdt_amount_micro = COALESCE(usdt_amount_micro, $2) WHERE id = $1', [c.id, expected]);
    await client.query(
      'INSERT INTO checkout_addresses (address, checkout_id, chain, bitnob_id) VALUES ($1, $2, $3, $4) ON CONFLICT (checkout_id, chain) DO NOTHING',
      [address, c.id, chain, bitnobId],
    );
  });
  // Course entre deux requêtes : on renvoie l'adresse enregistrée
  return (await one('SELECT address FROM checkout_addresses WHERE checkout_id = $1 AND chain = $2', [c.id, chain])).address;
}

// Montant en micro-unités (6 décimales). Bitnob envoie la plus petite unité (« 9000000 » = 9 USDT) ;
// amount_formatted (décimal), quand il est fourni par la reconfirmation, fait foi.
const toMicro = (formatted, smallest) => {
  if (formatted !== undefined && formatted !== null && Number.isFinite(Number(formatted))) return Math.round(Number(formatted) * 1e6);
  return Math.round(Number(smallest));
};

const SETTLED = /^(settled|success|successful|completed|confirmed)$/i;

// Événement deposit.success (champs à la racine ou dans data)
export async function handleDeposit(d, { verified }) {
  // Jamais sur la foi d'un événement non signé : il créditerait un solde
  if (!verified) return { status: 'ignored', reason: 'non vérifié' };
  const currency = String(d.currency || '').toUpperCase();
  if (!['USDT', 'USDC'].includes(currency)) return { status: 'ignored', reason: `devise ${currency || 'absente'}` };
  const addr = d.address && (await one('SELECT * FROM checkout_addresses WHERE address = $1', [d.address]));
  if (!addr) return { status: 'ignored', reason: 'adresse inconnue' };
  const c = await getCheckout(addr.checkout_id);
  const txId = String(d.transaction_id || d.hash || d.reference || '');
  if (!txId) return { status: 'ignored', reason: 'transaction absente' };

  let micro = toMicro(undefined, d.amount);
  if (!c.demo) {
    // Double vérification côté serveur : la transaction doit être réglée chez Bitnob
    const t = await bitnob.getTransaction(d.transaction_id || d.reference);
    const state = String(t?.state || t?.status || '');
    if (!SETTLED.test(state)) return { status: 'pending', reason: `transaction ${state || 'inconnue'}`, retry: true };
    micro = toMicro(t.amount_formatted, t.amount ?? d.amount);
  }
  if (!(micro > 0)) return { status: 'ignored', reason: 'montant nul' };

  const received = await tx(async (client) => {
    // Verrou sur le paiement : sérialise avec markPaid (dont l'UPDATE prend le même verrou)
    const row = await one('SELECT status FROM checkouts WHERE id = $1 FOR UPDATE', [c.id], client);
    const inserted = await client.query(
      `INSERT INTO deposits (transaction_id, checkout_id, address, chain, currency, amount_micro, hash) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (transaction_id) DO NOTHING`,
      [txId, c.id, addr.address, addr.chain, currency, micro, d.hash || null],
    );
    if (!inserted.rowCount) return null;
    // L'argent reçu est toujours crédité : paiement complet, partiel, ou dépôt arrivé après le paiement
    await creditDeposit(client, c, { depositId: txId, micro, currency });
    // Paiement déjà réglé (double envoi, ou payé entre-temps en Lightning) : rien d'autre à faire
    if (row.status === 'paid') return 'extra';
    const r = await one('SELECT SUM(amount_micro)::bigint AS total FROM deposits WHERE checkout_id = $1', [c.id], client);
    await client.query('UPDATE checkouts SET usdt_received_micro = $2 WHERE id = $1', [c.id, r.total]);
    return Number(r.total);
  });
  if (received === null) return { status: 'duplicate', checkout: c.id };
  publish(`merchant:${c.merchant_id}`, 'balance', { reason: 'payment' });
  if (received === 'extra') return { status: 'paid', checkout: c.id, extra: true };

  const expected = c.usdt_amount_micro ?? usdtExpectedMicro(c.amount_xof);
  if (received >= expected * (1 - config.usdt.tolerancePct / 100)) {
    await markPaid(c.id, { by: c.demo ? 'deposit_demo' : 'bitnob_deposit', asset: 'USDT' });
  } else {
    // Paiement partiel : la page du client affiche le reste à envoyer
    publish(`checkout:${c.id}`, 'status', publicCheckout(await getCheckout(c.id)));
  }
  const now = await getCheckout(c.id);
  console.log(`₮ Dépôt ${currency} ${micro / 1e6} sur ${addr.chain} pour ${c.id} → ${now.status}`);
  return { status: now.status, checkout: c.id, received: (received / 1e6).toFixed(2) };
}
