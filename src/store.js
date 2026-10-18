import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Base Supabase (PostgreSQL). Le serveur utilise la clé secrète : elle contourne la RLS,
// qui bloque tout accès public aux tables. Elle ne doit jamais aller dans le navigateur.
if (!config.supabase.url || !config.supabase.serviceKey) {
  throw new Error("Supabase non configuré : remplissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans le fichier .env");
}

export const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// La colonne checkouts.livemode arrive avec 005_modes.sql. On vérifie une fois au démarrage
// qu'elle existe : sinon, on ne l'écrit pas et on ne filtre pas dessus.
const livemodeProbe = await supabase.from("checkouts").select("livemode").limit(1);
export const hasLivemodeColumn = !livemodeProbe.error;
if (!hasLivemodeColumn) console.warn("[base] colonne checkouts.livemode absente : lancez supabase/005_modes.sql (mode test seulement en attendant)");

const CHECKOUT_COLUMNS = "*, webhook_deliveries(event_id, type, attempt, status, at), merchants(business_name, webhook_secret)";

function check({ data, error }, what) {
  if (error) throw new Error(`Supabase (${what}) : ${error.message}`);
  return data;
}

/* ---------- Conversion ligne <-> objet ---------- */

function toCheckout(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    amountSats: row.amount_sats,
    rate: { btcXof: Number(row.rate_btc_xof), source: row.rate_source },
    reference: row.reference,
    description: row.description,
    returnUrl: row.return_url,
    webhookUrl: row.webhook_url,
    baseUrl: row.base_url,
    invoiceId: row.invoice_id,
    paymentRequest: row.payment_request,
    paymentHash: row.payment_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    paidVia: row.paid_via,
    lastCheckedAt: Number(row.last_checked_at),
    merchantId: row.merchant_id ?? null,
    merchantName: row.merchants?.business_name ?? null,
    merchantWebhookSecret: row.merchants?.webhook_secret ?? null,
    // Colonne ajoutée par 005_modes.sql. Avant, on déduit le mode de la facture (lntb = testnet).
    livemode: "livemode" in row ? row.livemode : !String(row.payment_request).startsWith("lntb"),
    deliveries: (row.webhook_deliveries ?? [])
      .map((d) => ({ event: d.event_id, type: d.type, attempt: d.attempt, status: d.status, at: d.at }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.attempt - b.attempt),
  };
}

function fromCheckout(c) {
  return {
    id: c.id,
    status: c.status,
    amount: c.amount,
    currency: c.currency,
    amount_sats: c.amountSats,
    rate_btc_xof: c.rate.btcXof,
    rate_source: c.rate.source,
    reference: c.reference ?? null,
    description: c.description ?? null,
    return_url: c.returnUrl ?? null,
    webhook_url: c.webhookUrl ?? null,
    base_url: c.baseUrl ?? null,
    invoice_id: c.invoiceId,
    payment_request: c.paymentRequest,
    payment_hash: c.paymentHash ?? null,
    created_at: c.createdAt,
    expires_at: c.expiresAt,
    paid_at: c.paidAt ?? null,
    paid_via: c.paidVia ?? null,
    last_checked_at: c.lastCheckedAt ?? 0,
    merchant_id: c.merchantId ?? null,
    ...(hasLivemodeColumn ? { livemode: Boolean(c.livemode) } : {}),
  };
}

/* ---------- Paiements ---------- */

export async function saveCheckout(c) {
  check(await supabase.from("checkouts").upsert(fromCheckout(c)), "enregistrer un paiement");
  return c;
}

export async function getCheckout(id) {
  const row = check(await supabase.from("checkouts").select(CHECKOUT_COLUMNS).eq("id", id).maybeSingle(), "lire un paiement");
  return toCheckout(row);
}

export async function findCheckoutByReference(reference) {
  const row = check(
    await supabase
      .from("checkouts")
      .select(CHECKOUT_COLUMNS)
      .eq("reference", reference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "chercher une référence",
  );
  return toCheckout(row);
}

export async function findCheckoutByInvoiceOrHash(keys) {
  for (const key of keys) {
    for (const column of ["invoice_id", "payment_hash"]) {
      const row = check(
        await supabase.from("checkouts").select(CHECKOUT_COLUMNS).eq(column, key).limit(1).maybeSingle(),
        "chercher une facture",
      );
      if (row) return toCheckout(row);
    }
  }
  return null;
}

// `livemode` : true = paiements réels seulement, false = test seulement, undefined = tous.
export async function listCheckouts(merchantId, limit = 200, livemode) {
  let query = supabase.from("checkouts").select(CHECKOUT_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (merchantId) query = query.eq("merchant_id", merchantId);
  if (typeof livemode === "boolean" && hasLivemodeColumn) query = query.eq("livemode", livemode);
  const rows = check(await query, "lister les paiements");
  return rows.map(toCheckout);
}

export async function addDelivery(checkoutId, d) {
  check(
    await supabase
      .from("webhook_deliveries")
      .insert({ checkout_id: checkoutId, event_id: d.event, type: d.type, attempt: d.attempt, status: d.status, at: d.at }),
    "enregistrer un envoi de webhook",
  );
}

/* ---------- Événements Bitnob (anti-doublon) ---------- */

// Renvoie true si l'événement est nouveau, false s'il a déjà été reçu.
export async function rememberEvent(key, summary) {
  const { error } = await supabase.from("bitnob_events").insert({
    key,
    type: summary.type ?? null,
    reference: summary.reference ?? null,
    status: summary.status ?? null,
  });
  if (!error) return true;
  if (error.code === "23505") return false; // clé déjà présente
  throw new Error(`Supabase (enregistrer un événement) : ${error.message}`);
}

/* ---------- Commandes de la boutique de démo ---------- */

export async function saveOrder(o) {
  check(
    await supabase.from("orders").upsert({
      id: o.id,
      product: o.product,
      name: o.name,
      amount: o.amount,
      status: o.status,
      checkout_id: o.checkoutId ?? null,
      created_at: o.createdAt,
      paid_at: o.paidAt ?? null,
    }),
    "enregistrer une commande",
  );
  return o;
}

export async function getOrder(id) {
  const row = check(await supabase.from("orders").select("*").eq("id", id).maybeSingle(), "lire une commande");
  if (!row) return null;
  return {
    id: row.id,
    product: row.product,
    name: row.name,
    amount: row.amount,
    status: row.status,
    checkoutId: row.checkout_id,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

/* ---------- Comptes marchands ---------- */

const VERIFICATION_FIELDS = [
  ["live_api_key_hash", "liveApiKeyHash"],
  ["live_api_key_hint", "liveApiKeyHint"],
  ["email_verified_at", "emailVerifiedAt"],
  ["verification_status", "verificationStatus"],
  ["legal_name", "legalName"],
  ["legal_form", "legalForm"],
  ["sector", "sector"],
  ["ninea", "ninea"],
  ["rccm", "rccm"],
  ["representative_name", "representativeName"],
  ["address", "address"],
  ["city", "city"],
  ["payout_method", "payoutMethod"],
  ["payout_account", "payoutAccount"],
  ["verification_submitted_at", "verificationSubmittedAt"],
  ["verification_note", "verificationNote"],
];

function toMerchant(row) {
  if (!row) return null;
  const m = {
    id: row.id,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    apiKeyHash: row.api_key_hash,
    apiKeyHint: row.api_key_hint,
    webhookSecret: row.webhook_secret,
    // undefined tant que 003_google.sql n'a pas été lancé : la colonne n'est alors jamais envoyée.
    ...("google_sub" in row ? { googleSub: row.google_sub } : {}),
    createdAt: row.created_at,
  };
  // Colonnes ajoutées par 004_verification.sql : présentes seulement après la migration.
  // Seulement les colonnes qui existent déjà (migrations 004 et 005), pour ne jamais en écrire une absente.
  for (const [col, key] of VERIFICATION_FIELDS) if (col in row) m[key] = row[col] ?? null;
  return m;
}

function fromMerchant(m) {
  const row = {
    id: m.id,
    business_name: m.businessName,
    email: m.email,
    phone: m.phone ?? null,
    password_hash: m.passwordHash ?? null,
    api_key_hash: m.apiKeyHash,
    api_key_hint: m.apiKeyHint,
    webhook_secret: m.webhookSecret,
  };
  // Colonne ajoutée par 003_google.sql : on ne l'envoie que si elle sert.
  if (m.googleSub !== undefined) row.google_sub = m.googleSub;
  for (const [col, key] of VERIFICATION_FIELDS) if (m[key] !== undefined) row[col] = m[key];
  return row;
}

// Renvoie null si l'email est déjà utilisé.
export async function createMerchant(m) {
  const { error } = await supabase.from("merchants").insert(fromMerchant(m));
  if (error?.code === "23505") return null;
  check({ error }, "créer un compte marchand");
  return m;
}

export async function saveMerchant(m) {
  check(await supabase.from("merchants").upsert(fromMerchant(m)), "enregistrer un compte marchand");
  return m;
}

export async function getMerchant(id) {
  return toMerchant(check(await supabase.from("merchants").select("*").eq("id", id).maybeSingle(), "lire un compte"));
}

export async function getMerchantByEmail(email) {
  return toMerchant(
    check(await supabase.from("merchants").select("*").eq("email", String(email).toLowerCase()).maybeSingle(), "chercher un compte"),
  );
}

export async function getMerchantByGoogleSub(sub) {
  return toMerchant(check(await supabase.from("merchants").select("*").eq("google_sub", sub).maybeSingle(), "chercher un compte Google"));
}

// Renvoie { merchant, mode } : la clé est soit la clé test, soit la clé de production du marchand.
export async function getMerchantByApiKeyHash(hash) {
  const test = check(await supabase.from("merchants").select("*").eq("api_key_hash", hash).maybeSingle(), "vérifier une clé API");
  if (test) return { merchant: toMerchant(test), mode: "test" };
  const live = await supabase.from("merchants").select("*").eq("live_api_key_hash", hash).maybeSingle();
  if (live.data) return { merchant: toMerchant(live.data), mode: "live" };
  return null;
}

// Les paiements créés avant les comptes marchands sont rattachés au compte de démo.
export async function adoptOrphanCheckouts(merchantId) {
  check(await supabase.from("checkouts").update({ merchant_id: merchantId }).is("merchant_id", null), "rattacher les anciens paiements");
}

export async function listMerchantsByStatus(status) {
  const rows = check(
    await supabase.from("merchants").select("*").eq("verification_status", status).order("verification_submitted_at", { ascending: true }),
    "lister les vérifications",
  );
  return rows.map(toMerchant);
}
