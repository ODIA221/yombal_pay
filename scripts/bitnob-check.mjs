// Vérifie vos clés Bitnob avant la démo : signature HMAC, taux, création d'une facture de 1 000 sats.
import { bitnob } from '../server/src/lib/bitnob.js';

const step = async (label, fn) => {
  try { const r = await fn(); console.log(`✅ ${label}`, JSON.stringify(r).slice(0, 300)); return r; }
  catch (e) { console.log(`❌ ${label} : ${e.message}`); }
};

await step('Authentification (GET /api/whoami)', () => bitnob.whoami());
await step('Taux BTC/XOF', () => bitnob.getRate('BTC', 'XOF'));
await step('Taux BTC/USDT', () => bitnob.getRate('BTC', 'USDT'));
const inv = await step('Facture Lightning 1 000 sats', () =>
  bitnob.createInvoice({ amountSats: 1000, description: 'Test YombalPay', reference: `yp_check_${Date.now()}`, expirySeconds: 600 }));
if (inv?.id) await step('Lecture de la facture', () => bitnob.getInvoice(inv.id));
await step('Cotation trading 0,0001 BTC → USDT', () => bitnob.createQuote({ quantityBtc: '0.00010000', side: 'sell' }));
const countries = await step('Corridors de retrait (payouts)', () => bitnob.payoutCountries());
const list = Array.isArray(countries) ? countries : countries?.countries ?? [];
const sn = list.find((c) => (c.code || c.country || c.iso2) === 'SN');
console.log(sn ? '✅ Corridor Sénégal (SN) ouvert sur ce compte' : '⚠️  Corridor Sénégal (SN) non listé : utilisez PAYOUT_MODE=simulated pour la démo et demandez son ouverture à Bitnob');
if (sn) {
  await step('Exigences du corridor SN', () => bitnob.payoutRequirements('SN'));
  await step('Opérateurs mobile money SN', () => bitnob.payoutBanks('SN'));
}
