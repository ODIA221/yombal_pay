import crypto from "node:crypto";
import { config, assertBitnobConfigured } from "./config.js";

// Construit les en-têtes signés en HMAC-SHA256 pour une requête Bitnob.
// `body` doit être exactement la chaîne envoyée sur le réseau ("" sans corps).
// `mode` : "test" (sandbox Bitnob) ou "live" (production Bitnob).
export function signRequest({ method, path, body = "", mode = "test" }) {
  const { signing } = config.bitnob;
  const clientId = mode === "live" ? config.bitnob.liveClientId : config.bitnob.clientId;
  const clientSecret = mode === "live" ? config.bitnob.liveClientSecret : config.bitnob.clientSecret;
  const nonce = crypto.randomBytes(16).toString("hex");

  let timestamp;
  let stringToSign;
  if (signing === "workshop") {
    timestamp = String(Date.now());
    stringToSign = `${method.toUpperCase()}${path}${timestamp}${nonce}${body}`;
  } else {
    timestamp = String(Math.floor(Date.now() / 1000));
    stringToSign = `${clientId}:${timestamp}:${nonce}:${body}`;
  }

  const signature = crypto.createHmac("sha256", clientSecret).update(stringToSign).digest("hex");

  return {
    "x-auth-client": clientId,
    "x-auth-timestamp": timestamp,
    "x-auth-nonce": nonce,
    "x-auth-signature": signature,
  };
}

export class BitnobError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = "BitnobError";
    this.status = status;
    this.data = data;
  }
}

async function request(method, path, payload, mode = "test") {
  try {
    assertBitnobConfigured(mode);
  } catch (err) {
    throw new BitnobError(err.message, { status: 503 });
  }
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...signRequest({ method, path, body, mode }),
  };

  let res;
  try {
    res = await fetch(config.bitnob.baseUrl + path, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new BitnobError(`Bitnob injoignable (${config.bitnob.baseUrl}) : ${err.message}`);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok || data?.success === false) {
    const msg = data?.detail || data?.message || data?.error || `HTTP ${res.status}`;
    throw new BitnobError(`Bitnob ${method} ${path} a échoué : ${msg}`, { status: res.status, data });
  }
  return data;
}

// Vérifie que les identifiants et la signature sont acceptés.
export function whoami(mode = "test") {
  return request("GET", "/api/whoami", undefined, mode);
}

// Crée une facture Lightning. `amountSats` en satoshis (1 à 20 000 000).
// `reference` sert de clé d'idempotence : la réutiliser renvoie la même facture.
export async function createLightningInvoice({ amountSats, description, reference, expirySeconds = 900, mode = "test" }) {
  const res = await request(
    "POST",
    "/api/lightning/invoices",
    { amount: amountSats, description, reference, expiry: expirySeconds },
    mode,
  );
  return res?.data ?? res;
}

export async function getLightningInvoice(id, mode = "test") {
  const res = await request("GET", `/api/lightning/invoices/${encodeURIComponent(id)}`, undefined, mode);
  return res?.data ?? res;
}
