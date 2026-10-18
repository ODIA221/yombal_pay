// Rapprochement comptable.
// 1. Par marchand : chaque paiement, dépôt, retrait et conversion doit avoir exactement les écritures attendues
//    dans le registre (ni crédit manquant, ni crédit en double, ni montant différent), et aucun solde négatif.
// 2. Plateforme : la somme des soldes de tous les marchands (+ les commissions YombalPay) doit correspondre
//    au solde réel du compte Bitnob (GET /api/balances).
import { config } from '../config.js';
import { many, one } from '../db/pool.js';
import { bitnob } from './bitnob.js';

// Opérations de démo exclues en mode réel, comme dans le calcul des soldes
const LIVE = '(NOT x.demo OR $2)';
const STUCK_MINUTES = 30;

const issue = (severity, code, message, ref) => ({ severity, code, message, ref });

export async function reconcileMerchant(merchantId) {
  const p = [merchantId, config.demoMode];
  const issues = [];

  // ── Paiements Lightning : un crédit et une commission, au bon montant, seulement si payé ──
  const btcPayments = await many(
    `SELECT x.id, x.reference, x.status, x.amount_sats, x.fee_sats,
       (SELECT SUM(amount) FROM ledger_entries l WHERE l.checkout_id = x.id AND l.type = 'payment') AS credited,
       (SELECT SUM(amount) FROM ledger_entries l WHERE l.checkout_id = x.id AND l.type = 'fee') AS fee
     FROM checkouts x WHERE x.merchant_id = $1 AND x.pay_asset = 'BTC' AND ${LIVE}
       AND (x.status = 'paid' OR EXISTS (SELECT 1 FROM ledger_entries l WHERE l.checkout_id = x.id))`,
    p,
  );
  for (const c of btcPayments) {
    const credited = c.credited === null ? null : Number(c.credited);
    if (c.status !== 'paid') issues.push(issue('error', 'credit_without_payment', `Crédit inscrit pour un paiement « ${c.status} »`, c.id));
    else if (credited === null) issues.push(issue('error', 'payment_not_credited', `Paiement ${c.reference} payé mais jamais crédité`, c.id));
    else if (credited !== Number(c.amount_sats)) issues.push(issue('error', 'credit_mismatch', `Paiement ${c.reference} : ${credited} sats crédités au lieu de ${c.amount_sats}`, c.id));
    if (c.status === 'paid' && Number(c.fee_sats) > 0 && Number(c.fee ?? 0) !== -Number(c.fee_sats))
      issues.push(issue('error', 'fee_mismatch', `Paiement ${c.reference} : commission inscrite différente de ${c.fee_sats} sats`, c.id));
  }

  // ── Dépôts USDT : chacun crédité une fois, et le total reçu du paiement égal à la somme des dépôts ──
  const deposits = await many(
    `SELECT d.transaction_id, d.amount_micro, x.reference,
       (SELECT SUM(amount) FROM ledger_entries l WHERE l.deposit_id = d.transaction_id AND l.type = 'payment') AS credited
     FROM deposits d JOIN checkouts x ON x.id = d.checkout_id WHERE x.merchant_id = $1 AND ${LIVE}`,
    p,
  );
  for (const d of deposits) {
    if (d.credited === null) issues.push(issue('error', 'deposit_not_credited', `Dépôt USDT sur ${d.reference} jamais crédité`, d.transaction_id));
    else if (Number(d.credited) !== Number(d.amount_micro))
      issues.push(issue('error', 'deposit_mismatch', `Dépôt sur ${d.reference} : montant crédité différent du dépôt`, d.transaction_id));
  }
  const received = await many(
    `SELECT x.id, x.reference, x.usdt_received_micro, COALESCE(SUM(d.amount_micro), 0)::bigint AS total
     FROM checkouts x LEFT JOIN deposits d ON d.checkout_id = x.id
     WHERE x.merchant_id = $1 AND ${LIVE} AND (x.usdt_received_micro IS NOT NULL OR d.transaction_id IS NOT NULL)
     GROUP BY x.id`,
    p,
  );
  for (const r of received)
    if (Number(r.usdt_received_micro ?? 0) !== Number(r.total))
      issues.push(issue('error', 'received_mismatch', `Paiement ${r.reference} : total USDT reçu incohérent avec les dépôts`, r.id));

  // ── Retraits : un débit au montant exact ; un remboursement si et seulement si le retrait a échoué ──
  const payouts = await many(
    `SELECT x.id, x.reference, x.status, x.source_asset, x.source_amount, x.created_at, x.provider,
       (SELECT SUM(amount) FROM ledger_entries l WHERE l.payout_id = x.id AND l.type = 'payout') AS debited,
       (SELECT SUM(amount) FROM ledger_entries l WHERE l.payout_id = x.id AND l.type = 'payout_reversal') AS reversed
     FROM payouts x WHERE x.merchant_id = $1 AND (NOT (x.provider = 'simulated') OR $2)`,
    p,
  );
  for (const po of payouts) {
    if (Number(po.debited ?? 0) !== -Number(po.source_amount))
      issues.push(issue('error', 'payout_debit_mismatch', `Retrait ${po.reference} : débit inscrit différent du montant retiré`, po.id));
    if (po.status === 'failed' && Number(po.reversed ?? 0) !== Number(po.source_amount))
      issues.push(issue('error', 'payout_not_refunded', `Retrait ${po.reference} échoué mais pas remboursé`, po.id));
    if (po.status !== 'failed' && po.reversed !== null)
      issues.push(issue('error', 'refund_without_failure', `Retrait ${po.reference} remboursé alors qu'il n'a pas échoué`, po.id));
    if (['pending', 'processing'].includes(po.status) && Date.now() - new Date(po.created_at).getTime() > STUCK_MINUTES * 60_000)
      issues.push(issue('warning', 'payout_stuck', `Retrait ${po.reference} en cours depuis plus de ${STUCK_MINUTES} min : à vérifier chez Bitnob`, po.id));
  }

  // ── Conversions BTC → USDT : sortie BTC et entrée USDT aux montants de la conversion ──
  const conversions = await many(
    `SELECT x.id, x.sats, x.usdt_micro,
       (SELECT SUM(amount) FROM ledger_entries l WHERE l.conversion_id = x.id AND l.type = 'conversion_out') AS out_btc,
       (SELECT SUM(amount) FROM ledger_entries l WHERE l.conversion_id = x.id AND l.type = 'conversion_in') AS in_usdt
     FROM conversions x WHERE x.merchant_id = $1 AND (NOT (x.provider = 'simulated') OR $2)`,
    p,
  );
  for (const v of conversions)
    if (Number(v.out_btc ?? 0) !== -Number(v.sats) || Number(v.in_usdt ?? 0) !== Number(v.usdt_micro))
      issues.push(issue('error', 'conversion_mismatch', 'Conversion inscrite avec des montants différents', v.id));

  // ── Soldes : jamais négatifs, ni disponibles ni épargnés ──
  const pockets = await many(
    `SELECT pocket, asset, COALESCE(SUM(amount), 0)::bigint AS total FROM ledger_entries x
     WHERE x.merchant_id = $1 AND ${LIVE} GROUP BY pocket, asset`,
    p,
  );
  for (const b of pockets)
    if (Number(b.total) < 0)
      issues.push(issue('error', 'negative_balance', `Solde ${b.asset} ${b.pocket === 'savings' ? 'épargné' : 'disponible'} négatif`, `${b.pocket}:${b.asset}`));

  const errors = issues.filter((i) => i.severity === 'error').length;
  return {
    ok: errors === 0,
    errors,
    warnings: issues.length - errors,
    checked_at: new Date().toISOString(),
    checked: { payments: btcPayments.length, deposits: deposits.length, payouts: payouts.length, conversions: conversions.length },
    issues,
  };
}

// Soldes Bitnob (plus petite unité : sats pour BTC, 6 décimales pour USDT / USDC)
function bitnobTotals(data) {
  const accounts = data?.accounts ?? (Array.isArray(data) ? data : []);
  const sum = (cur) =>
    accounts.filter((a) => String(a.currency).toUpperCase() === cur).reduce((s, a) => s + Number(a.ledger_balance ?? a.available_balance ?? 0), 0);
  return { BTC: sum('BTC'), USDT: sum('USDT') + sum('USDC') };
}

// Rapprochement de la plateforme avec le compte Bitnob (mode réel uniquement)
export async function reconcilePlatform() {
  const rows = await many(
    `SELECT asset,
       COALESCE(SUM(amount), 0)::bigint AS merchants,
       COALESCE(SUM(-amount) FILTER (WHERE type = 'fee'), 0)::bigint AS fees
     FROM ledger_entries WHERE NOT demo GROUP BY asset`,
  );
  const ours = Object.fromEntries(['BTC', 'USDT'].map((a) => {
    const r = rows.find((x) => x.asset === a);
    return [a, { merchants: Number(r?.merchants ?? 0), fees: Number(r?.fees ?? 0) }];
  }));
  const report = { checked_at: new Date().toISOString(), ledger: ours, bitnob: null, gaps: null, ok: null };
  if (config.demoMode) return { ...report, note: 'Mode démo : pas de compte Bitnob à rapprocher.' };
  const b = bitnobTotals(await bitnob.getBalances());
  report.bitnob = b;
  // Ce que Bitnob devrait détenir : les soldes des marchands + les commissions encaissées par YombalPay
  report.gaps = Object.fromEntries(['BTC', 'USDT'].map((a) => [a, b[a] - (ours[a].merchants + ours[a].fees)]));
  report.ok = report.gaps.BTC === 0 && report.gaps.USDT === 0;
  const stuck = await one(
    `SELECT COUNT(*)::int AS n FROM payouts WHERE status IN ('pending', 'processing') AND provider <> 'simulated' AND created_at < now() - interval '${STUCK_MINUTES} minutes'`,
  );
  report.stuck_payouts = stuck.n;
  return report;
}
