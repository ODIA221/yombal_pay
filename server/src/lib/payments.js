// Cœur métier : création de paiement, confirmation atomique et idempotente, expiration, vérification serveur.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, many, tx } from '../db/pool.js';
import { bitnob } from './bitnob.js';
import { getXofPerBtc, xofToSats, satsToXof } from './rates.js';
import { newId } from './ids.js';
import { publish } from './bus.js';
import { notifyMerchant } from './notifier.js';
import { autoConvert, creditPayment } from './ledger.js';
import { maybeAutoPayout } from './payouts.js';
import { cleanHttpUrl } from './security.js';

export const MIN_XOF = 100;
export const MAX_XOF = 5_000_000;

const SELECT = `SELECT c.*, m.name AS merchant_name, m.username AS merchant_username FROM checkouts c JOIN merchants m ON m.id = c.merchant_id`;

// Frais évités par rapport à un transfert classique, nets de la commission YombalPay (jamais négatif)
export function savingsXof(amountXof, feeXof) {
  return Math.max(0, Math.round((amountXof * config.savingsBenchmarkBps) / 10_000 - feeXof));
}

export function publicCheckout(c) {
  return {
    id: c.id,
    object: 'checkout',
    status: c.status,
    reference: c.reference,
    description: c.description,
    amount: c.amount_xof,
    currency: 'XOF',
    amount_sats: c.amount_sats,
    rate: { xof_per_btc: c.xof_per_btc, source: c.rate_source, fixed: c.rate_fixed },
    payment_request: c.invoice_request,
    expires_at: c.expires_at,
    pay_url: `${config.publicUrl}/pay/${c.id}`,
    return_url: c.return_url,
    merchant: { name: c.merchant_name, username: c.merchant_username },
    source: c.source,
    created_at: c.created_at,
    paid_at: c.paid_at,
    demo: c.demo,
    savings: {
      xof: savingsXof(c.amount_xof, c.amount_sats ? (c.fee_sats * c.amount_xof) / c.amount_sats : 0),
      benchmark_pct: config.savingsBenchmarkBps / 100,
    },
    metadata: c.metadata ?? {},
  };
}

// Vue détaillée pour le marchand propriétaire
export const privateCheckout = (c) => ({
  ...publicCheckout(c),
  fee_sats: c.fee_sats,
  confirmed_by: c.confirmed_by,
  preimage: c.preimage,
  payment_hash: c.payment_hash,
  customer_email: c.customer_email,
  payer_note: c.payer_note,
});

export const getCheckout = (id) => one(`${SELECT} WHERE c.id = $1`, [id]);

export async function findByInvoice({ invoiceId, paymentHash, bitnobReference }) {
  return one(
    `${SELECT} WHERE ($1::text IS NOT NULL AND c.invoice_id = $1) OR ($2::text IS NOT NULL AND c.payment_hash = $2) OR ($3::text IS NOT NULL AND c.bitnob_reference = $3) LIMIT 1`,
    [invoiceId || null, paymentHash || null, bitnobReference || null],
  );
}

function fakeBolt11(sats) {
  // Facture factice lisible (mode démo uniquement, non payable par un vrai portefeuille)
  return `lnbc${sats}0n1pdemo${crypto.randomBytes(40).toString('hex')}`;
}

function parseExpiry(exp, fallback) {
  if (!exp) return fallback;
  const d = /^\d+$/.test(String(exp)) ? new Date(Number(exp) * 1000) : new Date(exp);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export function validateAmountXof(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < MIN_XOF || n > MAX_XOF) return `Le montant doit être compris entre ${MIN_XOF} et ${MAX_XOF.toLocaleString('fr-FR')} FCFA.`;
  return null;
}

// input : { amount (FCFA) | amount_sats, reference, description, return_url, webhook_url, customer_email, payer_note, metadata, source }
export async function createCheckout(merchant, input) {
  const reference = String(input.reference || newId('ord')).slice(0, 80);

  const existing = await one(`${SELECT} WHERE c.merchant_id = $1 AND c.reference = $2`, [merchant.id, reference]);
  // Idempotence côté marchand : même référence → même paiement (pas de doublon)
  if (existing && existing.status !== 'expired') return { checkout: existing, created: false };

  const rate = await getXofPerBtc();
  let amountSats;
  let amountXof;
  if (input.amount_sats) {
    amountSats = Math.floor(Number(input.amount_sats));
    amountXof = Math.max(1, satsToXof(amountSats, rate.xofPerBtc));
  } else {
    amountXof = Math.round(Number(input.amount));
    amountSats = xofToSats(amountXof, rate.xofPerBtc);
  }
  const returnUrl = cleanHttpUrl(input.return_url);
  if (returnUrl === undefined) throw Object.assign(new Error('return_url doit être une URL http(s).'), { status: 422 });

  const id = newId('chk');
  const bitnobReference = `yp_${id}`;
  const description = String(input.description || `${merchant.name}, commande ${reference}`).slice(0, 140);
  const fallbackExpiry = new Date(Date.now() + config.invoiceExpirySeconds * 1000);

  let invoice;
  if (config.demoMode) {
    invoice = { id: newId('inv_demo'), request: fakeBolt11(amountSats), paymentHash: crypto.randomBytes(32).toString('hex'), expiresAt: fallbackExpiry };
  } else {
    const inv = await bitnob.createInvoice({ amountSats, description, reference: bitnobReference, expirySeconds: config.invoiceExpirySeconds });
    invoice = {
      id: inv.id,
      request: inv.request || inv.payment_request || inv.paymentRequest || inv.bolt11,
      paymentHash: inv.payment_hash ?? null,
      expiresAt: parseExpiry(inv.expires_at, fallbackExpiry),
    };
    if (!invoice.request) throw new Error('Bitnob n’a pas renvoyé de facture Lightning.');
  }

  const row = await tx(async (client) => {
    // Une ancienne tentative expirée libère sa référence
    if (existing) await client.query(`UPDATE checkouts SET reference = reference || '#expired-' || id WHERE id = $1`, [existing.id]);
    return one(
      `INSERT INTO checkouts (id, merchant_id, reference, bitnob_reference, description, amount_xof, amount_sats, fee_sats, xof_per_btc,
         rate_source, rate_fixed, invoice_id, invoice_request, payment_hash, expires_at, return_url, webhook_url, customer_email, payer_note,
         metadata, source, demo, staff_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (merchant_id, reference) DO NOTHING RETURNING id`,
      [
        id, merchant.id, reference, bitnobReference, description, amountXof, amountSats,
        Math.floor((amountSats * (merchant.fee_bps ?? config.feeBps)) / 10_000),
        Math.round(rate.xofPerBtc), rate.source, rate.fixed, invoice.id, invoice.request, invoice.paymentHash, invoice.expiresAt,
        returnUrl, input.webhook_url || null, input.customer_email ? String(input.customer_email).slice(0, 120) : null,
        input.payer_note ? String(input.payer_note).slice(0, 140) : null,
        input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {},
        input.source || 'api', config.demoMode, input.staff_id || null,
      ],
      client,
    );
  });

  // Course entre deux requêtes avec la même référence : on renvoie celle qui a gagné
  if (!row) return { checkout: await one(`${SELECT} WHERE c.merchant_id = $1 AND c.reference = $2`, [merchant.id, reference]), created: false };
  const checkout = await getCheckout(id);
  publish(`merchant:${merchant.id}`, 'checkout', publicCheckout(checkout));
  return { checkout, created: true };
}

// Passage à « payé » : atomique (UPDATE … WHERE status = 'pending') et idempotent, quelle que soit la source.
export async function markPaid(checkoutId, { by, preimage } = {}) {
  const paid = await tx(async (client) => {
    const c = await one(
      `UPDATE checkouts SET status = 'paid', paid_at = now(), confirmed_by = $2, preimage = COALESCE($3, preimage)
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [checkoutId, by, preimage || null],
      client,
    );
    if (c) await creditPayment(client, c);
    return c;
  });
  if (!paid) return false;

  const c = await getCheckout(checkoutId);
  const view = publicCheckout(c);
  publish(`checkout:${c.id}`, 'status', view);
  publish(`merchant:${c.merchant_id}`, 'checkout', view);
  publish(`merchant:${c.merchant_id}`, 'balance', { reason: 'payment' });
  notifyMerchant(c, 'checkout.paid');
  console.log(`✅ Paiement ${c.id} (${c.amount_xof} FCFA / ${c.amount_sats} sats) confirmé par ${by}`);

  const merchant = await one('SELECT * FROM merchants WHERE id = $1', [c.merchant_id]);
  // Conversion USDT puis retrait automatique (réglages du marchand), au mieux, sans bloquer la confirmation
  autoConvert(merchant, c.amount_sats - c.fee_sats)
    .then(() => maybeAutoPayout(merchant))
    .catch((err) => console.warn(`Automatisations ${merchant.id} : ${err.message}`));
  return true;
}

export async function markExpired(checkoutId) {
  const c = await one(`UPDATE checkouts SET status = 'expired' WHERE id = $1 AND status = 'pending' RETURNING id`, [checkoutId]);
  if (!c) return false;
  const full = await getCheckout(checkoutId);
  const view = publicCheckout(full);
  publish(`checkout:${full.id}`, 'status', view);
  publish(`merchant:${full.merchant_id}`, 'checkout', view);
  return true;
}

const PAID = ['paid', 'settled', 'success', 'successful', 'completed'];

// Vérification serveur auprès de Bitnob (la vérité vient toujours du serveur, jamais du navigateur).
export async function refreshFromBitnob(c) {
  if (c.status !== 'pending') return c.status;
  const expired = new Date(c.expires_at).getTime() < Date.now() - 60_000;
  if (c.demo) {
    if (new Date(c.expires_at).getTime() < Date.now()) await markExpired(c.id);
    return (await getCheckout(c.id)).status;
  }
  const inv = await bitnob.getInvoice(c.invoice_id);
  const status = String(inv?.status || '').toLowerCase();
  if (PAID.includes(status)) await markPaid(c.id, { by: 'bitnob_api', preimage: inv.preimage });
  else if (status === 'expired' || status === 'failed' || expired) await markExpired(c.id);
  return (await getCheckout(c.id)).status;
}

let polling = false;
export function startPoller() {
  setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const pending = await many(`SELECT * FROM checkouts WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100`);
      for (const c of pending) {
        try {
          await refreshFromBitnob(c);
        } catch (err) {
          if (err.status !== 404) console.warn(`Vérification ${c.id} : ${err.message}`);
        }
      }
    } catch (err) {
      console.warn('Vérificateur :', err.message);
    } finally {
      polling = false;
    }
  }, config.pollIntervalMs).unref?.();
}

// staffId : un caissier ne voit que ses propres ventes
export const listCheckouts = (merchantId, { status, limit = 100, q, staffId } = {}) =>
  many(
    `${SELECT} WHERE c.merchant_id = $1 AND ($2::text IS NULL OR c.status = $2)
       AND ($4::text IS NULL OR c.reference ILIKE '%' || $4 || '%' OR c.description ILIKE '%' || $4 || '%')
       AND ($5::text IS NULL OR c.staff_id = $5)
     ORDER BY c.created_at DESC LIMIT $3`,
    [merchantId, status || null, Math.min(Number(limit) || 100, 500), q || null, staffId || null],
  );
