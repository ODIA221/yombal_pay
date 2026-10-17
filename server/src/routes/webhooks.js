// POST /webhooks/bitnob : réception des événements Bitnob.
// 1. Vérifie la signature HMAC-SHA512 (x-bitnob-signature) si BITNOB_WEBHOOK_SECRET est défini
// 2. Ignore les doublons (idempotence par id d'événement, stockée en base)
// 3. Reconfirme le statut auprès de l'API Bitnob avant de marquer « Payé »
import express from 'express';
import { config } from '../config.js';
import { one, query } from '../db/pool.js';
import { verifyBitnobWebhook } from '../lib/bitnob.js';
import { findByInvoice, getCheckout, markPaid, refreshFromBitnob } from '../lib/payments.js';
import { handlePayoutEvent } from '../lib/payouts.js';

export const webhookRouter = express.Router();

const SUCCESS = /(success|paid|received|settled|completed)/i;
const NOT_INCOMING = /(fail|send|sent|reversed|debit|payout|withdrawal)/i;

const alreadyProcessed = async (key) => Boolean(await one('SELECT 1 FROM processed_events WHERE key = $1', [key]));
const markProcessed = (key) => query('INSERT INTO processed_events (key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);

export async function processBitnobEvent(body, { verified }) {
  const type = String(body?.event || body?.type || '');
  const data = body?.data ?? body ?? {};
  const eventId = body?.id || body?.event_id;

  // Retraits mobile money
  if (/payout|withdrawal/i.test(type)) {
    const key = eventId ? `evt:${eventId}` : `${type}:${data?.reference}`;
    if (await alreadyProcessed(key)) return { status: 'duplicate', key };
    // Jamais sur la foi d'un événement non signé : un échec rembourse, et un faux succès figerait le retrait
    // (un vrai échec arrivé ensuite ne pourrait plus le rembourser)
    if (!verified) return { status: 'ignored', reason: 'non vérifié' };
    const r = await handlePayoutEvent(type, data);
    await markProcessed(key);
    return r;
  }

  const reference = data.reference || data.invoice?.reference || data.metadata?.reference;
  const invoiceId = data.invoice_id || data.invoice?.id || data.id;
  const paymentHash = data.payment_hash || data.paymentHash || data.invoice?.payment_hash;

  const key = eventId ? `evt:${eventId}` : `${type}:${reference || paymentHash || invoiceId}`;
  if (await alreadyProcessed(key)) return { status: 'duplicate', key };

  const checkout = await findByInvoice({ invoiceId, paymentHash, bitnobReference: reference });
  if (!checkout) return { status: 'ignored', reason: 'paiement inconnu', type };

  const isSuccess = SUCCESS.test(type) && !NOT_INCOMING.test(type);
  if (!isSuccess) {
    await markProcessed(key);
    return { status: 'ignored', reason: `événement ${type}`, checkout: checkout.id };
  }

  // Double vérification : on redemande le statut à Bitnob côté serveur
  if (!checkout.demo) {
    try {
      await refreshFromBitnob(checkout);
    } catch (err) {
      console.warn(`Reconfirmation Bitnob impossible (${err.message})`);
    }
  }
  let current = await getCheckout(checkout.id);
  if (current.status === 'pending' && (verified || (current.demo && config.demoMode))) {
    await markPaid(current.id, { by: current.demo ? 'webhook_demo' : 'bitnob_webhook', preimage: data.preimage });
    current = await getCheckout(checkout.id);
  }

  if (current.status === 'paid') await markProcessed(key);
  return { status: current.status, checkout: current.id };
}

webhookRouter.post('/bitnob', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = req.body?.length ? req.body.toString('utf8') : '';
  const signature = req.get('x-bitnob-signature') || req.get('x-brails-signature');
  const verified = verifyBitnobWebhook(raw, signature);

  if (config.bitnob.webhookSecret && !verified) {
    console.warn('⚠️  Webhook Bitnob rejeté : signature invalide');
    return res.status(401).json({ error: 'signature invalide' });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  try {
    const result = await processBitnobEvent(body, { verified });
    console.log(`📩 Webhook Bitnob ${body?.event || body?.type} →`, result);
    res.json({ received: true, ...result });
  } catch (err) {
    console.error('Erreur webhook', err);
    // 200 quand même : la vérification serveur périodique rattrapera le paiement
    res.json({ received: true, status: 'error' });
  }
});
