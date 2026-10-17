// Notification du site marchand : webhook signé + nouvelles tentatives avec délai croissant.
// En-tête : X-YombalPay-Signature: t=<timestamp>,v1=<hex HMAC-SHA256(secret, "t.body")>
import crypto from 'node:crypto';
import { one, query } from '../db/pool.js';
import { newId } from './ids.js';
import { publish } from './bus.js';
import { assertSafeWebhookUrl } from './security.js';
import { getCheckout, publicCheckout } from './payments.js';

const RETRY_DELAYS_MS = [0, 2_000, 5_000, 15_000, 30_000, 60_000];

export function signMerchantPayload(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

export async function notifyMerchant(checkout, type = 'checkout.paid') {
  try {
    const merchant = await one('SELECT id, webhook_url, webhook_secret FROM merchants WHERE id = $1', [checkout.merchant_id]);
    const url = checkout.webhook_url || merchant?.webhook_url;
    if (!url) return;

    const delivery = await one(
      `INSERT INTO deliveries (id, merchant_id, checkout_id, type, url) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [newId('dlv'), merchant.id, checkout.id, type, url],
    );
    const event = { id: newId('evt'), type, created_at: new Date().toISOString(), data: publicCheckout(checkout) };
    attempt(delivery, event, merchant.webhook_secret, 0);
  } catch (err) {
    console.error('Notification marchand :', err.message);
  }
}

async function attempt(delivery, event, secret, i) {
  const body = JSON.stringify(event);
  let status = 'retrying';
  let code = null;
  let error = null;
  try {
    await assertSafeWebhookUrl(delivery.url); // revérifié à l'envoi (DNS rebinding)
    const res = await fetch(delivery.url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'YombalPay-Webhooks/2.0',
        'X-YombalPay-Event': event.type,
        'X-YombalPay-Delivery': delivery.id,
        'X-YombalPay-Signature': signMerchantPayload(body, secret),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    code = res.status;
    if (res.ok) status = 'delivered';
    else error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }

  const next = RETRY_DELAYS_MS[i + 1];
  if (status !== 'delivered' && next === undefined) status = 'failed';
  const row = await one(
    `UPDATE deliveries SET status = $2, attempts = attempts + 1, last_status_code = $3, last_error = $4,
       delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END
     WHERE id = $1 RETURNING *`,
    [delivery.id, status, code, error],
  ).catch(() => null);
  if (row) publish(`merchant:${row.merchant_id}`, 'delivery', row);
  if (status === 'retrying') setTimeout(() => attempt(delivery, event, secret, i + 1), next).unref?.();
}

export async function retryDelivery(merchantId, deliveryId) {
  const d = await one('SELECT * FROM deliveries WHERE id = $1 AND merchant_id = $2', [deliveryId, merchantId]);
  if (!d) return false;
  const c = await getCheckout(d.checkout_id);
  if (!c) return false;
  await notifyMerchant(c, d.type);
  return true;
}

export const listDeliveries = (merchantId) =>
  query('SELECT * FROM deliveries WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 50', [merchantId]).then((r) => r.rows);
