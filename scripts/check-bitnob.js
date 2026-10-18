// Vérifie les identifiants Bitnob et la signature : npm run check:bitnob
import { config } from "../src/config.js";
import { whoami } from "../src/bitnob.js";

console.log(`Hôte : ${config.bitnob.baseUrl} · signature : ${config.bitnob.signing}`);
try {
  const res = await whoami();
  console.log("OK, Bitnob accepte la signature :");
  console.log(JSON.stringify(res, null, 2));
} catch (err) {
  console.error(`ÉCHEC : ${err.message}`);
  if (err.data) console.error(JSON.stringify(err.data, null, 2));
  const detail = String(err.data?.detail || err.message);
  if (/whitelist/i.test(detail)) {
    console.error(
      "\nIdentifiants acceptés, mais l'IP de cette machine est bloquée.\n" +
        "Ajoutez votre IP publique (https://api.ipify.org) dans le tableau de bord Bitnob,\n" +
        "dans la liste blanche des adresses IP de vos clés API.",
    );
  } else if (err.status === 401) {
    console.error(
      "\nSignature ou identifiants refusés. Vérifiez .env, puis essayez l'autre méthode :\n" +
        "  BITNOB_SIGNING=workshop et BITNOB_BASE_URL=https://sandboxapi.bitnob.co",
    );
  }
  process.exit(1);
}
