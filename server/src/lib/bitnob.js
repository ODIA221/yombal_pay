// Client Bitnob signé HMAC-SHA256.
// Signature = hex(HMAC_SHA256(CLIENT_SECRET, "CLIENT_ID:TIMESTAMP:NONCE:BODY"))
// TIMESTAMP en secondes, NONCE = 16 octets hex, BODY = JSON exact envoyé ("" pour un GET).
import crypto from 'node:crypto';
import { config } from '../config.js';

export class BitnobError extends Error {
  constructor(message, { status, body, path } = {}) {
    super(message);
    this.name = 'BitnobError';
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

export function signRequest(payload, { clientId, clientSecret, timestamp, nonce } = {}) {
  const id = clientId ?? config.bitnob.clientId;
  const secret = clientSecret ?? config.bitnob.clientSecret;
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const n = nonce ?? crypto.randomBytes(16).toString('hex');
  const message = `${id}:${ts}:${n}:${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return {
    'X-Auth-Client': id,
    'X-Auth-Timestamp': ts,
    'X-Auth-Nonce': n,
    'X-Auth-Signature': signature,
  };
}

// Bitnob n'accepte que les adresses IP déclarées dans son tableau de bord. Quand il refuse la nôtre, on donne
// l'adresse publique exacte à ajouter (elle change souvent sur une connexion grand public).
let publicIp = { value: null, at: 0 };
async function currentPublicIp() {
  if (publicIp.value && Date.now() - publicIp.at < 300_000) return publicIp.value;
  try {
    const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(3000) });
    publicIp = { value: (await r.text()).trim(), at: Date.now() };
  } catch {}
  return publicIp.value;
}

async function request(method, path, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...signRequest(payload),
  };

  let res;
  try {
    res = await fetch(`${config.bitnob.baseUrl}${path}`, {
      method,
      headers,
      body: payload || undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new BitnobError(`Bitnob injoignable : ${err.message}`, { path });
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok || json?.success === false) {
    let detail = json?.detail || json?.message || json?.error?.message || json?.title || text;
    if (/not whitelisted/i.test(detail)) {
      const ip = await currentPublicIp();
      detail += ip
        ? ` : ajoutez l'adresse IP ${ip} dans le tableau de bord Bitnob (liste des IP autorisées)`
        : ` : ajoutez l'adresse IP publique de ce serveur dans le tableau de bord Bitnob`;
    }
    throw new BitnobError(`Bitnob ${res.status} sur ${path} : ${detail}`, {
      status: res.status,
      body: json,
      path,
    });
  }
  // Les réponses Bitnob sont parfois enveloppées dans { success, data }, parfois à plat.
  return json?.data ?? json;
}

export const bitnob = {
  whoami: () => request('GET', '/api/whoami'),

  // POST /api/lightning/invoices : montant en sats, reference = clé d'idempotence
  createInvoice: ({ amountSats, description, reference, expirySeconds, customerId }) =>
    request('POST', '/api/lightning/invoices', {
      amount: amountSats,
      description,
      reference,
      expiry: expirySeconds,
      ...(customerId ? { customer_id: customerId } : {}),
    }),

  // GET /api/lightning/invoices/:id : status "paid" + preimage = preuve de paiement
  getInvoice: (id) => request('GET', `/api/lightning/invoices/${encodeURIComponent(id)}`),
  // POST /api/lightning/pay : paie une facture depuis le portefeuille Bitnob (outil de test sandbox)
  payInvoice: ({ request: invoice, reference, maxFee }) => request('POST', '/api/lightning/pay', { request: invoice, reference, ...(maxFee ? { max_fee: maxFee } : {}) }),

  // GET /api/exchange-rates?from=BTC&to=XOF
  getRate: (from, to) =>
    request('GET', `/api/exchange-rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // POST /api/customers
  createCustomer: ({ email, firstName, lastName, phone }) =>
    request('POST', '/api/customers', {
      email,
      first_name: firstName,
      last_name: lastName,
      ...(phone ? { phone } : {}),
    }),

  // POST /api/trading/quotes : cotation BTC → USDT (protection contre la volatilité)
  createQuote: ({ quantityBtc, side = 'sell' }) =>
    request('POST', '/api/trading/quotes', {
      base_currency: 'BTC',
      quote_currency: 'USDT',
      side,
      quantity: quantityBtc,
    }),

  // POST /api/trading/orders : exécute la conversion au prix coté (quote_id)
  createOrder: ({ quantityBtc, price, quoteId, reference, side = 'sell' }) =>
    request('POST', '/api/trading/orders', {
      base_currency: 'BTC',
      quote_currency: 'USDT',
      side,
      quantity: quantityBtc,
      price: String(price),
      ...(quoteId ? { quote_id: quoteId } : {}),
      reference,
    }),

  getBalances: () => request('GET', '/api/balances'),

  // ── Stablecoins : adresse de dépôt par paiement, puis webhook deposit.success ──
  // POST /api/addresses : chain (polygon, solana, ethereum…), label, reference (idempotence)
  createAddress: ({ chain, label, reference }) => request('POST', '/api/addresses', { chain, label, reference }),
  supportedChains: () => request('GET', '/api/stablecoins/supported-chains'),
  // GET /api/transactions/:id (UUID ou référence) : state SETTLED, amount en plus petite unité
  getTransaction: (id) => request('GET', `/api/transactions/${encodeURIComponent(id)}`),

  // ── Payouts (retrait vers mobile money) : quote → initialize → finalize ──
  payoutCountries: () => request('GET', '/api/payouts/supported-countries'),
  payoutRequirements: (country) => request('GET', `/api/payouts/supported-countries/${encodeURIComponent(country)}`),
  payoutBanks: (country) => request('GET', `/api/payouts/banks/${encodeURIComponent(country)}`),

  // settlement_amount = montant exact reçu par le bénéficiaire, en monnaie locale
  payoutQuote: ({ settlementAmount, country, fromAsset, toCurrency, reference }) =>
    request('POST', '/api/payouts/quotes', {
      settlement_amount: String(settlementAmount),
      country,
      from_asset: fromAsset,
      to_currency: toCurrency,
      source: 'offchain',
      reference,
    }),

  payoutInitialize: (quoteId, { reference, reason, callbackUrl, beneficiary }) =>
    request('POST', `/api/payouts/${encodeURIComponent(quoteId)}/initialize`, {
      quote_id: quoteId,
      reference,
      payment_reason: reason,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      beneficiary,
    }),

  payoutFinalize: (quoteId) => request('POST', `/api/payouts/${encodeURIComponent(quoteId)}/finalize`),
};

// Vérifie la signature d'un webhook Bitnob : HMAC-SHA512 du corps brut, en-tête x-bitnob-signature.
export function verifyBitnobWebhook(rawBody, signatureHeader, secret = config.bitnob.webhookSecret) {
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signatureHeader).trim(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
