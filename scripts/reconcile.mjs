// Rapprochement comptable : chaque marchand (registre ↔ paiements, dépôts, retraits, conversions),
// puis la plateforme entière avec le solde réel du compte Bitnob.
//   ./run.sh reconcile      (Windows : run.bat reconcile)
import { many, migrate, pool } from '../server/src/db/pool.js';
import { reconcileMerchant, reconcilePlatform } from '../server/src/lib/reconciliation.js';

await migrate(); // schéma à jour, même si le serveur n'a pas encore redémarré
let errors = 0;
const merchants = await many('SELECT id, name, username FROM merchants ORDER BY created_at');
console.log(`\n── Marchands (${merchants.length}) ──`);
for (const m of merchants) {
  const r = await reconcileMerchant(m.id);
  errors += r.errors;
  const c = r.checked;
  console.log(`${r.ok ? '✅' : '❌'} ${m.name} (@${m.username}) : ${c.payments} paiements, ${c.deposits} dépôts, ${c.payouts} retraits, ${c.conversions} conversions vérifiés`);
  for (const i of r.issues) console.log(`   ${i.severity === 'error' ? '❌' : '⚠️ '} ${i.message} [${i.ref}]`);
}

console.log('\n── Plateforme ↔ compte Bitnob ──');
try {
  const p = await reconcilePlatform();
  const f = (a, v) => (a === 'BTC' ? `${v} sats` : `${(v / 1e6).toFixed(2)} USDT`);
  for (const a of ['BTC', 'USDT']) console.log(`   Registre ${a} : marchands ${f(a, p.ledger[a].merchants)} + commissions ${f(a, p.ledger[a].fees)}`);
  if (p.note) console.log(`ℹ️  ${p.note}`);
  else {
    for (const a of ['BTC', 'USDT']) console.log(`${p.gaps[a] === 0 ? '✅' : '❌'} Bitnob ${a} : ${f(a, p.bitnob[a])} (écart ${f(a, p.gaps[a])})`);
    if (p.stuck_payouts) console.log(`⚠️  ${p.stuck_payouts} retrait(s) en cours depuis plus de 30 min`);
    if (!p.ok) errors++;
  }
} catch (e) {
  console.log(`❌ Soldes Bitnob illisibles : ${e.message}`);
  errors++;
}
console.log(errors ? `\n${errors} écart(s) à examiner` : '\nTout est rapproché ✔');
await pool.end();
process.exit(errors ? 1 : 0);
