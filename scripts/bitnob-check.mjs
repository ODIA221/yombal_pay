// Vérifie vos clés Bitnob avant la démo : signature HMAC, taux, création d'une facture de 1 000 sats.
import { bitnob } from '../server/src/lib/bitnob.js';
import { config as cfg } from '../server/src/config.js';

if (cfg.bitnob.keyEnv === 'none') {
  console.log('❌ BITNOB_CLIENT_ID / BITNOB_CLIENT_SECRET absents du .env');
  process.exit(1);
}
console.log(`ℹ️  Adresse : ${cfg.bitnob.baseUrl}`);
console.log(
  cfg.bitnob.keyEnv === 'production'
    ? '⚠️  Secret de PRODUCTION (prd:) : pour les tests, mettez le secret SANDBOX dans BITNOB_CLIENT_SECRET (l’ID client ne change pas)'
    : 'ℹ️  Secret sandbox : environnement de test',
);
if (cfg.demoMode) console.log('ℹ️  DEMO_MODE=true : le serveur n’utilisera pas ces clés tant que DEMO_MODE n’est pas retiré du .env');

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
if (!countries) console.log('⏭️  Corridor Sénégal (SN) non vérifié : l’appel précédent a échoué');
else console.log(sn ? '✅ Corridor Sénégal (SN) ouvert sur ce compte' : '⚠️  Corridor Sénégal (SN) non listé : utilisez PAYOUT_MODE=simulated pour la démo et demandez son ouverture à Bitnob');
if (sn) {
  await step('Exigences du corridor SN', () => bitnob.payoutRequirements('SN'));
  await step('Opérateurs mobile money SN', () => bitnob.payoutBanks('SN'));
}

// Paiement en USDT : les réseaux proposés aux clients (USDT_CHAINS) doivent être ouverts chez Bitnob
const { config } = await import('../server/src/config.js');
const chains = await step('Réseaux stablecoin (GET /api/stablecoins/supported-chains)', () => bitnob.supportedChains());
if (chains) {
  const names = JSON.stringify(chains).toLowerCase();
  for (const c of config.usdt.chains)
    console.log(names.includes(`"${c}"`) ? `✅ Réseau ${c} disponible` : `⚠️  Réseau ${c} absent de la liste Bitnob : retirez-le de USDT_CHAINS`);
}
