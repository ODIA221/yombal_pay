// Vérifie la connexion à Supabase et la présence des tables : npm run check:db
import { config } from "../src/config.js";

const host = config.supabase.url ? new URL(config.supabase.url).host : "(SUPABASE_URL vide)";
console.log(`Projet Supabase : ${host}`);

let supabase;
try {
  ({ supabase } = await import("../src/store.js"));
} catch (err) {
  console.error(`ÉCHEC : ${err.message}`);
  process.exit(1);
}

let ok = true;
for (const table of ["checkouts", "webhook_deliveries", "bitnob_events", "orders", "merchants"]) {
  // Vraie requête GET (pas HEAD) : une table absente renvoie alors une erreur explicite.
  const { count, error } = await supabase.from(table).select("*", { count: "exact" }).limit(1);
  if (error) {
    ok = false;
    const hint = /does not exist|schema cache/i.test(error.message)
      ? "table absente : exécutez supabase/schema.sql (ou 002_merchants.sql) dans le SQL Editor"
      : error.message;
    console.error(`  ✕ ${table} : ${hint}`);
  } else {
    console.log(`  ✓ ${table} (${count} lignes)`);
  }
}
if (!ok) process.exit(1);
console.log("OK, la base Supabase est prête.");
