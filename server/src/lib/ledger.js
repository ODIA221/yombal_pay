// Registre comptable du marchand : soldes BTC (sats) et USDT (micro-USDT), conversion BTC → USDT.
// Toute opération qui débite passe par un verrou consultatif par marchand : pas de double dépense.
import { config } from '../config.js';
import { one, many, query, tx } from '../db/pool.js';
import { bitnob } from './bitnob.js';
import { newId } from './ids.js';
import { publish } from './bus.js';
import { getXofPerBtc, satsToUsdtMicro, satsToXof, usdtMicroToXof, usdtPerBtc } from './rates.js';

export const lockMerchant = (client, merchantId) => client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [merchantId]);

// pocket « main » = solde disponible ; « savings » = épargne (exclue des retraits et conversions)
export async function balances(merchantId, client, pocket = 'main') {
  // En mode réel, l'argent de démo (paiements et opérations simulés) est exclu du solde
  const rows = await many(
    'SELECT asset, COALESCE(SUM(amount), 0)::bigint AS total FROM ledger_entries WHERE merchant_id = $1 AND (NOT demo OR $2) AND pocket = $3 GROUP BY asset',
    [merchantId, config.demoMode, pocket],
    client,
  );
  const get = (a) => Number(rows.find((r) => r.asset === a)?.total ?? 0);
  return { btc_sats: get('BTC'), usdt_micro: get('USDT') };
}

export async function balancesView(merchantId) {
  const [b, s] = await Promise.all([balances(merchantId), balances(merchantId, undefined, 'savings')]);
  const rate = await getXofPerBtc();
  const btcXof = satsToXof(b.btc_sats, rate.xofPerBtc);
  const usdtXof = usdtMicroToXof(b.usdt_micro);
  return {
    btc: { sats: b.btc_sats, xof: btcXof },
    usdt: { amount: (b.usdt_micro / 1e6).toFixed(2), micro: b.usdt_micro, xof: usdtXof },
    total_xof: btcXof + usdtXof,
    savings: { usdt: (s.usdt_micro / 1e6).toFixed(2), micro: s.usdt_micro, xof: usdtMicroToXof(s.usdt_micro) },
    rate: { xof_per_btc: Math.round(rate.xofPerBtc), usd_xof: config.rates.usdToXof, source: rate.source },
  };
}

// Crédit d'un paiement confirmé (dans la transaction qui le passe à « payé »)
// Commission sur un montant USDT, au taux (points de base) appliqué à la création du paiement
export const usdtFee = (c, micro) => Math.floor((micro * Math.round((c.fee_sats * 10_000) / c.amount_sats)) / 10_000);

// Paiement Lightning : crédit en sats. Un paiement en USDT est déjà crédité dépôt par dépôt (creditDeposit).
export async function creditPayment(client, c) {
  if (c.pay_asset === 'USDT') return;
  await client.query(
    `INSERT INTO ledger_entries (merchant_id, asset, amount, type, checkout_id, description, demo) VALUES ($1, 'BTC', $2, 'payment', $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [c.merchant_id, c.amount_sats, c.id, `Paiement ${c.reference}`, c.demo],
  );
  if (c.fee_sats > 0)
    await client.query(
      `INSERT INTO ledger_entries (merchant_id, asset, amount, type, checkout_id, description, demo) VALUES ($1, 'BTC', $2, 'fee', $3, 'Commission YombalPay', $4)
       ON CONFLICT DO NOTHING`,
      [c.merchant_id, -c.fee_sats, c.id, c.demo],
    );
}

// Dépôt stablecoin : crédité dès son arrivée, qu'il complète le paiement, soit partiel ou arrive après coup.
// Les index uniques (type, deposit_id) empêchent tout double crédit.
export async function creditDeposit(client, c, { depositId, micro, currency }) {
  await client.query(
    `INSERT INTO ledger_entries (merchant_id, asset, amount, type, deposit_id, description, demo) VALUES ($1, 'USDT', $2, 'payment', $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [c.merchant_id, micro, depositId, `Paiement ${c.reference} (${currency})`, c.demo],
  );
  const fee = usdtFee(c, micro);
  if (fee > 0)
    await client.query(
      `INSERT INTO ledger_entries (merchant_id, asset, amount, type, deposit_id, description, demo) VALUES ($1, 'USDT', $2, 'fee', $3, 'Commission YombalPay', $4)
       ON CONFLICT DO NOTHING`,
      [c.merchant_id, -fee, depositId, c.demo],
    );
}

// Conversion BTC → USDT via le trading Bitnob (cotation puis ordre au prix coté)
export async function convertToUsdt(merchantId, sats, { trigger = 'manual' } = {}) {
  sats = Math.floor(Number(sats));
  if (!Number.isFinite(sats) || sats < 1000) throw Object.assign(new Error('Montant minimum : 1 000 sats.'), { status: 422 });

  const result = await tx(async (client) => {
    await lockMerchant(client, merchantId);
    const b = await balances(merchantId, client);
    if (b.btc_sats < sats) throw Object.assign(new Error('Solde BTC insuffisant.'), { status: 422 });

    const quantityBtc = (sats / 1e8).toFixed(8);
    const id = newId('cnv');
    let price;
    let usdtMicro;
    let orderId = null;
    let provider = 'simulated';

    if (config.demoMode) {
      const rate = await getXofPerBtc();
      price = usdtPerBtc(rate.xofPerBtc);
      usdtMicro = satsToUsdtMicro(sats, rate.xofPerBtc);
    } else {
      const quote = await bitnob.createQuote({ quantityBtc, side: 'sell' });
      price = Number(quote.price);
      const order = await bitnob.createOrder({ quantityBtc, price: quote.price, quoteId: quote.id, reference: id });
      if (['rejected', 'cancelled'].includes(String(order.status).toLowerCase())) throw new Error(`Ordre Bitnob ${order.status}`);
      const received = Number(quote.exchange?.receive_quantity) || Number(quantityBtc) * price;
      usdtMicro = Math.floor(received * 1e6);
      orderId = order.id;
      provider = 'bitnob';
    }
    if (!(usdtMicro > 0)) throw new Error('Conversion impossible : montant USDT nul.');

    await client.query(
      `INSERT INTO conversions (id, merchant_id, sats, usdt_micro, price_usdt, provider, bitnob_order_id, trigger) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, merchantId, sats, usdtMicro, price, provider, orderId, trigger],
    );
    await client.query(
      `INSERT INTO ledger_entries (merchant_id, asset, amount, type, conversion_id, description, demo) VALUES
       ($1, 'BTC', $2, 'conversion_out', $4, 'Conversion vers USDT', $5),
       ($1, 'USDT', $3, 'conversion_in', $4, 'Conversion depuis BTC', $5)`,
      [merchantId, -sats, usdtMicro, id, provider === 'simulated'],
    );
    return { id, sats, usdt: (usdtMicro / 1e6).toFixed(2), usdt_micro: usdtMicro, price_usdt: price, provider, trigger };
  });
  publish(`merchant:${merchantId}`, 'balance', { reason: 'conversion' });
  return result;
}

// Conversion automatique d'une part de chaque paiement (réglage marchand), au mieux : un échec laisse les sats en BTC
export async function autoConvert(merchant, netSats) {
  const pct = merchant.auto_convert_pct || 0;
  const sats = Math.floor((netSats * pct) / 100);
  if (pct <= 0 || sats < 1000) return null;
  try {
    return await convertToUsdt(merchant.id, sats, { trigger: 'auto' });
  } catch (err) {
    console.warn(`Conversion auto ${merchant.id} : ${err.message}`);
    return null;
  }
}

export const listConversions = (merchantId) =>
  many('SELECT id, sats, usdt_micro, price_usdt, provider, trigger, created_at FROM conversions WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 50', [merchantId]);

export const listLedger = (merchantId, limit = 50) =>
  many('SELECT id, asset, amount, type, pocket, checkout_id, payout_id, conversion_id, description, created_at FROM ledger_entries WHERE merchant_id = $1 ORDER BY id DESC LIMIT $2', [merchantId, limit]);

// Statistiques et série sur 7 jours (heure de Dakar = UTC)
export async function stats(merchantId) {
  const s = await one(
    `SELECT
       COALESCE(SUM(amount_xof) FILTER (WHERE status = 'paid'), 0)::bigint AS total_xof,
       COALESCE(SUM(amount_sats) FILTER (WHERE status = 'paid' AND pay_asset = 'BTC'), 0)::bigint AS total_sats,
       COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
       COUNT(*)::int AS checkout_count,
       COALESCE(SUM(amount_xof) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('day', now())), 0)::bigint AS today_xof,
       COUNT(*) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('day', now()))::int AS today_count,
       COALESCE(SUM(GREATEST(0, ROUND(amount_xof * $3 / 10000.0 - fee_sats::numeric * amount_xof / NULLIF(amount_sats, 0))))
         FILTER (WHERE status = 'paid'), 0)::bigint AS savings_xof
     FROM checkouts WHERE merchant_id = $1 AND (NOT demo OR $2)`,
    [merchantId, config.demoMode, config.savingsBenchmarkBps],
  );
  const series = await many(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(c.amount_xof), 0)::bigint AS xof,
            COUNT(c.id)::int AS count
     FROM generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') d
     LEFT JOIN checkouts c ON c.merchant_id = $1 AND c.status = 'paid' AND date_trunc('day', c.paid_at) = d AND (NOT c.demo OR $2)
     GROUP BY d ORDER BY d`,
    [merchantId, config.demoMode],
  );
  const finished = s.paid_count + (await one(`SELECT COUNT(*)::int AS n FROM checkouts WHERE merchant_id = $1 AND status = 'expired' AND (NOT demo OR $2)`, [merchantId, config.demoMode])).n;
  return { ...s, savings_benchmark_pct: config.savingsBenchmarkBps / 100, conversion_rate: finished ? Math.round((s.paid_count / finished) * 100) : 0, series };
}

export { query };
