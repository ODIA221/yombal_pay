// Crée la base PostgreSQL si elle n'existe pas, sans dépendre de createdb / dropdb (absents du PATH sous Windows).
//   node scripts/ensure-db.mjs              → base de DATABASE_URL (.env), sinon postgres://localhost:5432/yombal_pay
//   node scripts/ensure-db.mjs <url>        → base donnée
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// pg et dotenv sont installés dans server/
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { Client } = require('pg');

export async function ensureDatabase(url, { reset = false } = {}) {
  const u = new URL(url);
  const name = decodeURIComponent(u.pathname.slice(1));
  if (!/^[\w-]+$/.test(name)) throw new Error(`Nom de base invalide : « ${name} »`);
  u.pathname = '/postgres'; // base de maintenance, toujours présente
  const client = new Client({ connectionString: u.toString() });
  await client.connect();
  try {
    if (reset) await client.query(`DROP DATABASE IF EXISTS "${name}"`);
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount) return { name, created: false };
    await client.query(`CREATE DATABASE "${name}"`);
    return { name, created: true };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  require('dotenv').config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const url = process.argv[2] || process.env.DATABASE_URL || 'postgres://localhost:5432/yombal_pay';
  try {
    const { name, created } = await ensureDatabase(url);
    console.log(created ? `Base locale « ${name} » créée` : `Base locale « ${name} » prête`);
  } catch (err) {
    console.error(`PostgreSQL injoignable : ${err.message}`);
    console.error('  Lancez PostgreSQL, ou renseignez DATABASE_URL (Supabase) dans .env.');
    console.error('  Sous Windows : DATABASE_URL=postgres://postgres:<mot-de-passe>@localhost:5432/yombal_pay');
    process.exit(1);
  }
}
