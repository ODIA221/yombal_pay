// Accès PostgreSQL : pool partagé, helpers de requête et transactions.
import fs from 'node:fs';
import pg from 'pg';
import { config } from '../config.js';

// bigint (int8) → Number : les montants en sats restent très en dessous de 2^53
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  // Supabase : connexion chiffrée. Avec DATABASE_SSL_CA (certificat téléchargé dans Supabase → Database → SSL),
  // le certificat du serveur est aussi vérifié (protection contre l'interception).
  ssl: !config.databaseSsl
    ? false
    : process.env.DATABASE_SSL_CA
      ? { ca: fs.readFileSync(process.env.DATABASE_SSL_CA, 'utf8'), rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});
pool.on('error', (err) => console.error('PostgreSQL :', err.message));

export const query = (text, params, client = pool) => client.query(text, params);
export const one = async (text, params, client = pool) => (await client.query(text, params)).rows[0] ?? null;
export const many = async (text, params, client = pool) => (await client.query(text, params)).rows;

// Exécute fn(client) dans une transaction ; ROLLBACK automatique en cas d'erreur
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const sql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}
