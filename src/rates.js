import { config } from "./config.js";

// Le franc CFA (XOF) est arrimé à l'euro : 1 EUR = 655,957 XOF.
export const XOF_PER_EUR = 655.957;
const CACHE_MS = 60_000;

let cache = null;

// Prix d'1 BTC en FCFA : BTC/EUR en direct (CoinGecko) × parité fixe, sinon taux de secours.
export async function getBtcXofRate() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const eur = (await res.json())?.bitcoin?.eur;
    if (!eur) throw new Error("réponse sans prix");
    cache = { btcXof: Math.round(eur * XOF_PER_EUR), source: "coingecko", at: Date.now() };
  } catch (err) {
    console.warn(`[taux] CoinGecko indisponible (${err.message}), taux de secours utilisé`);
    cache = { btcXof: config.btcXofFallback, source: "secours", at: Date.now() };
  }
  return cache;
}

// Convertit un montant en FCFA en sats, arrondi au sat supérieur pour ne jamais sous-facturer.
export function xofToSats(amountXof, btcXof) {
  return Math.ceil((amountXof / btcXof) * 1e8);
}
