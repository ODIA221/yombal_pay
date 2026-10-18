// Paie une facture Lightning depuis le portefeuille Bitnob SANDBOX, pour tester un paiement de bout en bout.
// Usage : ./run.sh pay <facture lntb…>   ou   ./run.sh pay <id du paiement chk_…>
// Refuse de s'exécuter si Bitnob ne confirme pas l'environnement sandbox : jamais d'argent réel.
import { bitnob } from '../server/src/lib/bitnob.js';
import { config } from '../server/src/config.js';

const arg = process.argv[2];
if (!arg) {
  console.log('Usage : ./run.sh pay <facture lntb…>  ou  ./run.sh pay <chk_…>');
  process.exit(1);
}
const me = await bitnob.whoami().catch((e) => ({ error: e.message }));
if (me?.environment !== 'sandbox') {
  console.log(`❌ Refusé : Bitnob indique l'environnement « ${me?.environment ?? me?.error} ». Cet outil ne paie qu'en sandbox.`);
  process.exit(1);
}

let invoice = arg;
if (arg.startsWith('chk_')) {
  const r = await fetch(`${config.publicUrl}/v1/checkouts/${arg}`).then((x) => x.json());
  invoice = r.payment_request;
  if (!invoice) {
    console.log(`❌ Paiement ${arg} introuvable sur ${config.publicUrl}`);
    process.exit(1);
  }
  console.log(`ℹ️  ${r.amount} FCFA · ${r.amount_sats} sats · statut ${r.status}`);
}
try {
  const paid = await bitnob.payInvoice({ request: invoice, reference: `yp_test_${Date.now()}` });
  console.log('✅ Paiement envoyé depuis le portefeuille sandbox :', JSON.stringify(paid).slice(0, 300));
  console.log('ℹ️  La page de paiement passe à « Payé » en quelques secondes (vérification toutes les 4 s).');
} catch (e) {
  console.log(`❌ ${e.message}`);
  if (/not available/i.test(e.message))
    console.log('ℹ️  Bitnob n’autorise pas encore les paiements Lightning sortants sur ce compte : payez la facture avec un portefeuille Lightning testnet, ou utilisez DEMO_MODE=true pour la démonstration.');
  process.exit(1);
}
