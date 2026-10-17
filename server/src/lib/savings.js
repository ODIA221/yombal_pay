// Épargne en USDT : le marchand met de côté une part de chaque vente (ou un montant ponctuel) vers un objectif
// (Tabaski, rentrée, stock…). L'épargne est un compartiment du registre (pocket « savings ») : en dollars stables,
// hors du solde disponible, débloquée seulement avec le mot de passe du propriétaire.
import { config } from '../config.js';
import { many, one, tx } from '../db/pool.js';
import { publish } from './bus.js';
import { balances, convertToUsdt, lockMerchant } from './ledger.js';
import { getXofPerBtc, usdtMicroToXof, xofToUsdtMicro } from './rates.js';

const err = (message, status = 422) => Object.assign(new Error(message), { status });

// Déplacement entre le solde disponible et l'épargne (deux écritures, sous le verrou du marchand)
async function move(merchantId, micro, { toSavings, description, trigger }) {
  micro = Math.floor(micro);
  if (!(micro > 0)) throw err('Montant invalide.');
  await tx(async (client) => {
    await lockMerchant(client, merchantId);
    const from = toSavings ? 'main' : 'savings';
    const available = (await balances(merchantId, client, from)).usdt_micro;
    if (available < micro) throw err(toSavings ? 'Solde USDT insuffisant.' : 'Épargne insuffisante.');
    // L'argent de démo reste de l'argent de démo : on garde le marqueur de la source
    const demo = config.demoMode;
    const type = toSavings ? 'savings_in' : 'savings_out';
    await client.query(
      `INSERT INTO ledger_entries (merchant_id, asset, amount, type, pocket, description, demo) VALUES
       ($1, 'USDT', $2, $4, 'main', $5, $6), ($1, 'USDT', $3, $4, 'savings', $5, $6)`,
      [merchantId, toSavings ? -micro : micro, toSavings ? micro : -micro, type, `${description}${trigger === 'auto' ? ' (automatique)' : ''}`, demo],
    );
  });
  publish(`merchant:${merchantId}`, 'balance', { reason: 'savings' });
  return micro;
}

// Met de côté un montant en FCFA. S'il manque des USDT, la différence est d'abord convertie depuis le BTC (trading Bitnob).
export async function saveXof(merchant, amountXof, { trigger = 'manual' } = {}) {
  const micro = xofToUsdtMicro(Math.round(Number(amountXof)));
  if (!(micro >= 1e6)) throw err('Montant minimum : l’équivalent de 1 USDT.');
  const { usdt_micro: usdt } = await balances(merchant.id);
  if (usdt < micro) {
    const rate = await getXofPerBtc();
    const missingSats = Math.ceil(((micro - usdt) / 1e6) * (config.rates.usdToXof / rate.xofPerBtc) * 1e8 * 1.01);
    await convertToUsdt(merchant.id, Math.max(missingSats, 1000), { trigger: 'savings' });
  }
  return move(merchant.id, micro, { toSavings: true, description: `Épargne : ${merchant.savings_goal_name || 'objectif'}`, trigger });
}

// Après chaque vente : X % du net mis de côté, au mieux (un échec n'empêche jamais la vente)
export async function autoSave(merchant, { sats = 0, usdtMicro = 0 }) {
  const pct = merchant.savings_pct || 0;
  if (pct <= 0) return null;
  try {
    let micro = Math.floor((usdtMicro * pct) / 100);
    if (sats) {
      const part = Math.floor((sats * pct) / 100);
      if (part < 1000) return null; // minimum de la conversion BTC → USDT
      micro = (await convertToUsdt(merchant.id, part, { trigger: 'savings' })).usdt_micro;
    }
    if (micro < 10_000) return null; // moins d'un centime de dollar
    return await move(merchant.id, micro, { toSavings: true, description: `Épargne : ${merchant.savings_goal_name || 'objectif'}`, trigger: 'auto' });
  } catch (e) {
    console.warn(`Épargne automatique ${merchant.id} : ${e.message}`);
    return null;
  }
}

// Débloquer : l'épargne revient dans le solde disponible (en USDT), prête à être retirée vers Wave / OM
export async function unlock(merchant, amountXof) {
  const { usdt_micro: saved } = await balances(merchant.id, undefined, 'savings');
  const micro = amountXof ? Math.min(xofToUsdtMicro(Math.round(Number(amountXof))), saved) : saved;
  return move(merchant.id, micro, { toSavings: false, description: `Épargne débloquée : ${merchant.savings_goal_name || 'objectif'}` });
}

export async function savingsView(merchant) {
  const { usdt_micro: micro } = await balances(merchant.id, undefined, 'savings');
  const xof = usdtMicroToXof(micro);
  const goal = merchant.savings_goal_xof ? Number(merchant.savings_goal_xof) : null;
  const history = await many(
    `SELECT amount, type, description, created_at FROM ledger_entries
     WHERE merchant_id = $1 AND pocket = 'savings' AND (NOT demo OR $2) ORDER BY id DESC LIMIT 30`,
    [merchant.id, config.demoMode],
  );
  const month = await one(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::bigint AS added FROM ledger_entries
     WHERE merchant_id = $1 AND pocket = 'savings' AND (NOT demo OR $2) AND created_at >= date_trunc('month', now())`,
    [merchant.id, config.demoMode],
  );
  return {
    balance: { usdt: (micro / 1e6).toFixed(2), micro, xof },
    goal: { name: merchant.savings_goal_name, xof: goal, progress: goal ? Math.min(100, Math.round((xof / goal) * 100)) : null },
    pct: merchant.savings_pct || 0,
    added_this_month_xof: usdtMicroToXof(Number(month.added)),
    history: history.map((h) => ({ ...h, usdt: (Number(h.amount) / 1e6).toFixed(2), xof: usdtMicroToXof(Number(h.amount)) })),
  };
}
