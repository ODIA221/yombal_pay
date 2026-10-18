import crypto from "node:crypto";
import { config } from "./config.js";
import { toApi } from "./api-format.js";
import { addDelivery } from "./store.js";

const RETRY_DELAYS_MS = [2_000, 10_000, 30_000]; // 4 tentatives au total

// Signature des webhooks envoyés aux marchands : "t=<secondes>,v1=<hex HMAC-SHA256(secret, t + "." + corps)>"
export function signPayload(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

// À utiliser côté marchand pour vérifier l'en-tête Yombal-Signature.
export function verifySignature(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(
    String(header || "")
      .split(",")
      .map((p) => p.trim().split("=")),
  );
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(rawBody, secret, t).split("v1=")[1]);
  const received = Buffer.from(parts.v1);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function notifyMerchant(type, checkout) {
  if (!checkout.webhookUrl) return;
  const secret = checkout.merchantWebhookSecret || config.merchantWebhookSecret;
  if (!secret) {
    console.warn("[webhook marchand] aucun secret de webhook pour ce marchand, envoi annulé");
    return;
  }
  const event = {
    id: "evt_" + crypto.randomBytes(8).toString("hex"),
    object: "event",
    type,
    created_at: new Date().toISOString(),
    livemode: toApi(checkout).livemode,
    data: toApi(checkout),
  };
  deliver(checkout.id, checkout.webhookUrl, event, secret, 1);
}

async function deliver(checkoutId, url, event, secret, attempt) {
  const body = JSON.stringify(event);
  let status = 0;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "YombalPay-Webhooks/1.0",
        "Yombal-Signature": signPayload(body, secret),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
  } catch (err) {
    console.warn(`[webhook marchand] ${event.type} vers ${url} : ${err.message}`);
  }

  const ok = status >= 200 && status < 300;
  console.log(`[webhook marchand] ${event.type} ${checkoutId} tentative ${attempt} -> ${status || "échec réseau"}`);

  await addDelivery(checkoutId, { event: event.id, type: event.type, attempt, status, at: new Date().toISOString() });

  if (!ok && attempt <= RETRY_DELAYS_MS.length) {
    setTimeout(() => deliver(checkoutId, url, event, secret, attempt + 1), RETRY_DELAYS_MS[attempt - 1]);
  }
}
