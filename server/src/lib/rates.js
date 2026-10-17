// Taux BTC → FCFA, avec une chaîne de repli explicite (la source est affichée au client).
// 1. Bitnob BTC/XOF   2. Bitnob BTC/USDT × USD_XOF   3. CoinGecko BTC/EUR × 655,957   4. Taux fixe de démo
import { config, EUR_TO_XOF } from '../config.js';
import { bitnob } from './bitnob.js';

let cache = null;

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickRate(r) {
  return num(r?.mid_rate) ?? num(r?.sell_rate) ?? num(r?.rate) ?? num(r?.buy_rate);
}

async function fromBitnob() {
  if (config.demoMode) return null;
  try {
    const r = pickRate(await bitnob.getRate('BTC', 'XOF'));
    if (r) return { xofPerBtc: r, source: 'Bitnob (BTC/XOF)' };
  } catch {}
  try {
    const r = pickRate(await bitnob.getRate('BTC', 'USDT'));
    if (r) return { xofPerBtc: r * config.rates.usdToXof, source: `Bitnob (BTC/USDT) × ${config.rates.usdToXof} FCFA/USD` };
  } catch {}
  return null;
}

async function fromCoinGecko() {
  if (!config.rates.allowPublicFallback) return null;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur', {
      signal: AbortSignal.timeout(5000),
    });
    const j = await res.json();
    const eur = num(j?.bitcoin?.eur);
    if (eur) return { xofPerBtc: eur * EUR_TO_XOF, source: 'CoinGecko (BTC/EUR) × 655,957 (parité fixe)' };
  } catch {}
  return null;
}

export async function getXofPerBtc({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < config.rates.cacheSeconds * 1000) return cache;

  const live = (await fromBitnob()) ?? (await fromCoinGecko());
  cache = live
    ? { ...live, fixed: false, fetchedAt: now }
    : { xofPerBtc: config.rates.fixedXofPerBtc, source: 'Taux fixe de démonstration', fixed: true, fetchedAt: now };
  return cache;
}

export function xofToSats(amountXof, xofPerBtc) {
  return Math.max(1, Math.ceil((amountXof / xofPerBtc) * 1e8));
}

export function satsToXof(sats, xofPerBtc) {
  return Math.round((sats / 1e8) * xofPerBtc);
}

// USDT : 1 USDT ≈ 1 USD ; montants internes en micro-USDT (1e-6)
export const usdtPerBtc = (xofPerBtc) => xofPerBtc / config.rates.usdToXof;
export const satsToUsdtMicro = (sats, xofPerBtc) => Math.floor((sats / 1e8) * usdtPerBtc(xofPerBtc) * 1e6);
export const usdtMicroToXof = (micro) => Math.round((micro / 1e6) * config.rates.usdToXof);
export const xofToUsdtMicro = (xof) => Math.ceil((xof / config.rates.usdToXof) * 1e6);
