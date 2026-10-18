// SDK Node.js YombalPay : accepter Bitcoin Lightning en FCFA en quelques lignes.
//
//   import YombalPay from 'yombalpay';
//   const tp = new YombalPay({ apiKey: process.env.YOMBALPAY_SECRET_KEY });
//   const checkout = await tp.createCheckout({ amount: 5000, currency: 'XOF', reference: 'CMD-42' });
//   res.redirect(checkout.pay_url);
import crypto from 'node:crypto';

export class YombalPayError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'YombalPayError';
    this.status = status;
    this.code = code;
  }
}

export default class YombalPay {
  constructor({ apiKey, baseUrl = process.env.YOMBALPAY_URL || 'http://localhost:3000' } = {}) {
    if (!apiKey) throw new YombalPayError('apiKey manquante (sk_… côté serveur)');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async #call(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new YombalPayError(json?.error?.message || `HTTP ${res.status}`, { status: res.status, code: json?.error?.code });
    return json;
  }

  /** Crée un paiement. amount en FCFA ; renvoie { id, pay_url, amount_sats, payment_request, … } */
  createCheckout({ amount, currency = 'XOF', reference, description, returnUrl, webhookUrl, customerEmail, metadata } = {}) {
    return this.#call('POST', '/v1/checkouts', {
      amount,
      currency,
      reference,
      description,
      return_url: returnUrl,
      webhook_url: webhookUrl,
      customer_email: customerEmail,
      metadata,
    });
  }

  getCheckout(id) {
    return this.#call('GET', `/v1/checkouts/${encodeURIComponent(id)}`);
  }

  listCheckouts({ status } = {}) {
    return this.#call('GET', `/v1/checkouts${status ? `?status=${status}` : ''}`);
  }

  createPaymentLink({ amount, description }) {
    return this.#call('POST', '/v1/payment-links', { amount, currency: 'XOF', description });
  }

  /**
   * Vérifie un webhook YombalPay. À appeler avec le corps BRUT de la requête.
   * En-tête : X-YombalPay-Signature: t=<ts>,v1=<hex>
   * @returns l'événement décodé, ou lève une erreur si la signature est invalide.
   */
  static verifyWebhook(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
    const parts = Object.fromEntries(
      String(signatureHeader || '')
        .split(',')
        .map((p) => p.split('=').map((s) => s.trim())),
    );
    const t = Number(parts.t);
    if (!t || !parts.v1) throw new YombalPayError('En-tête de signature absent ou mal formé');
    if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) throw new YombalPayError('Webhook trop ancien (rejeu ?)');
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(parts.v1);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new YombalPayError('Signature invalide');
    return JSON.parse(body);
  }
}

export { YombalPay };
