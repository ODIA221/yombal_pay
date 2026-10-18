import crypto from "node:crypto";
import { config } from "./config.js";
import { createLightningInvoice, getLightningInvoice } from "./bitnob.js";
import { getBtcXofRate, xofToSats } from "./rates.js";
import { saveCheckout, getCheckout, findCheckoutByReference, findCheckoutByInvoiceOrHash } from "./store.js";
import { notifyMerchant } from "./merchant-webhooks.js";

const MAX_SATS = 20_000_000; // limite Bitnob par facture
const STATUS_CHECK_MS = 3_000; // pas plus d'un appel Bitnob toutes les 3 s par paiement

export class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validUrl(value, field) {
  if (value == null || value === "") return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {}
  throw new CheckoutError(`${field} doit être une URL http(s) valide.`);
}

// mode "test" (clé sk_test_, Bitnob sandbox) ou "live" (clé sk_live_, Bitnob production).
export async function createCheckout(input, baseUrl, merchant, mode = "test") {
  const livemode = mode === "live";
  if (livemode && merchant?.verificationStatus !== "verified") {
    throw new CheckoutError("Les paiements réels sont réservés aux entreprises vérifiées. Activez votre compte.", 403);
  }
  const amount = Number(input.amount);
  const currency = String(input.currency || "XOF").toUpperCase();
  if (currency !== "XOF") throw new CheckoutError("currency doit être XOF (franc CFA).");
  if (!Number.isInteger(amount) || amount < 50) throw new CheckoutError("amount doit être un entier en FCFA, au moins 50.");

  const reference = input.reference ? String(input.reference).slice(0, 100) : null;
  const returnUrl = validUrl(input.return_url ?? input.returnUrl, "return_url");
  const webhookUrl = validUrl(input.webhook_url ?? input.webhookUrl, "webhook_url");
  const description = String(input.description || `Commande ${reference ?? ""}`.trim()).slice(0, 140);

  // Idempotence : la même référence marchand renvoie le paiement encore valide.
  if (reference) {
    const existing = await findCheckoutByReference(reference);
    if (existing && existing.merchantId === (merchant?.id ?? null) && existing.livemode === livemode) {
      await refreshCheckout(existing, { force: true });
      if (existing.status !== "expired") return existing;
    }
  }

  const rate = await getBtcXofRate();
  const amountSats = xofToSats(amount, rate.btcXof);
  if (amountSats > MAX_SATS) throw new CheckoutError("Montant trop élevé pour une seule facture Lightning.");

  const id = "chk_" + crypto.randomBytes(8).toString("hex");
  const invoice = await createLightningInvoice({
    amountSats,
    description: `${merchant?.businessName ?? config.merchantName} · ${description}`.slice(0, 200),
    reference: id,
    expirySeconds: config.checkoutExpirySeconds,
    mode,
  });

  const now = new Date();
  return saveCheckout({
    id,
    status: "pending",
    amount,
    currency,
    amountSats,
    rate: { btcXof: rate.btcXof, source: rate.source },
    reference,
    description,
    returnUrl,
    webhookUrl,
    baseUrl,
    invoiceId: invoice.id,
    paymentRequest: invoice.request,
    paymentHash: invoice.payment_hash,
    createdAt: now.toISOString(),
    expiresAt: invoice.expires_at || new Date(now.getTime() + config.checkoutExpirySeconds * 1000).toISOString(),
    paidAt: null,
    lastCheckedAt: 0,
    merchantId: merchant?.id ?? null,
    merchantName: merchant?.businessName ?? null,
    livemode,
  });
}

// Marque un paiement comme payé et prévient le site marchand. Idempotent.
export async function markPaid(checkout, via) {
  if (checkout.status === "paid") return checkout;
  checkout.status = "paid";
  checkout.paidAt = new Date().toISOString();
  checkout.paidVia = via;
  await saveCheckout(checkout);
  console.log(`[paiement] ${checkout.id} payé (${checkout.amount} FCFA, ${checkout.amountSats} sats, via ${via})`);
  notifyMerchant("checkout.paid", checkout);
  return checkout;
}

// Met à jour le statut d'un paiement en attente en interrogeant Bitnob côté serveur.
// C'est la seule source de vérité : un webhook ne fait que déclencher cette vérification.
export async function refreshCheckout(checkout, { force = false, via = "bitnob_status" } = {}) {
  if (checkout.status !== "pending") return checkout;
  if (!force && Date.now() - checkout.lastCheckedAt < STATUS_CHECK_MS) return checkout;

  checkout.lastCheckedAt = Date.now();
  try {
    const invoice = await getLightningInvoice(checkout.invoiceId, checkout.livemode ? "live" : "test");
    if (invoice?.status === "paid") return markPaid(checkout, via);
    if (invoice?.status === "expired") checkout.status = "expired";
  } catch (err) {
    console.warn(`[paiement] statut ${checkout.id} indisponible : ${err.message}`);
  }
  if (checkout.status === "pending" && Date.parse(checkout.expiresAt) < Date.now()) checkout.status = "expired";
  await saveCheckout(checkout);
  return checkout;
}

export async function getFreshCheckout(id) {
  const checkout = await getCheckout(id);
  return checkout ? refreshCheckout(checkout) : null;
}

// Retrouve le paiement visé par un événement Bitnob, quel que soit le champ utilisé.
export async function findCheckoutForBitnobData(data = {}) {
  const keys = [data.reference, data.invoice_reference, data.invoiceId, data.invoice_id, data.id, data.payment_hash, data.paymentHash]
    .filter(Boolean)
    .map(String);
  if (!keys.length) return null;

  const byId = keys.find((k) => k.startsWith("chk_"));
  if (byId) {
    const c = await getCheckout(byId);
    if (c) return c;
  }
  return findCheckoutByInvoiceOrHash(keys);
}
