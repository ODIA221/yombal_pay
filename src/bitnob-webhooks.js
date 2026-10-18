import crypto from "node:crypto";
import { config } from "./config.js";
import { rememberEvent } from "./store.js";
import { findCheckoutForBitnobData, refreshCheckout } from "./checkouts.js";

// Bitnob signe le corps brut avec le secret webhook (HMAC-SHA512 en hex selon la doc) dans x-bitnob-signature.
// La doc n'étant pas univoque, on accepte aussi SHA-256 et l'encodage base64, avec ou sans préfixe "sha512=".
export function verifyBitnobSignature(rawBody, header) {
  if (!config.bitnobWebhookSecret || !header || !rawBody) return false;
  const received = String(header).trim().replace(/^(sha512|sha256)=/i, "");
  for (const algo of ["sha512", "sha256"]) {
    const mac = crypto.createHmac(algo, config.bitnobWebhookSecret).update(rawBody);
    const digest = mac.digest();
    for (const expected of [digest.toString("hex"), digest.toString("base64")]) {
      const a = Buffer.from(expected);
      const b = Buffer.from(expected.length === 128 || expected.length === 64 ? received.toLowerCase() : received);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
  }
  return false;
}

export async function handleBitnobWebhook(rawBody, event) {
  const type = event?.event || event?.type || "inconnu";
  const data = event?.data ?? event ?? {};

  // Un même événement peut arriver plusieurs fois : on ne le traite qu'une fois.
  const key = event?.id || data?.event_id || crypto.createHash("sha256").update(rawBody).digest("hex");
  const isNew = await rememberEvent(key, { type, reference: data.reference ?? null, status: data.status ?? null });
  if (!isNew) return { result: "duplicate", type };

  const checkout = await findCheckoutForBitnobData(data);
  if (!checkout) return { result: "ignored", type };

  // On ne croit pas le webhook sur parole : on confirme le statut auprès de l'API Bitnob.
  await refreshCheckout(checkout, { force: true, via: `bitnob_webhook:${type}` });
  return { result: checkout.status, type, checkout: checkout.id };
}
