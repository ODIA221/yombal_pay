// Marchands, clés API (hashées) et sessions du tableau de bord.
import { config, realMoney } from '../config.js';
import { one, many, query, tx } from '../db/pool.js';
import { newId } from './ids.js';
import { hashPassword, randomToken, sha256 } from './security.js';

export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;
const RESERVED = new Set(['admin', 'api', 'app', 'pay', 'docs', 'support', 'yombalpay', 'bitnob', 'root', 'www', 'help', 'login', 'signup']);

export function validateUsername(u) {
  const v = String(u || '').trim().toLowerCase();
  if (!USERNAME_RE.test(v)) return { error: "L'identifiant doit faire 3 à 30 caractères : lettres minuscules, chiffres, point, tiret." };
  if (RESERVED.has(v)) return { error: 'Cet identifiant est réservé.' };
  return { value: v };
}

// Identifiant libre tiré du nom du commerce (« Boutique Aïssatou » → boutiqueaissatou, puis boutiqueaissatou2…) :
// il sert à l'adresse Lightning et à la page publique, le marchand n'a pas à le choisir.
export async function availableUsername(name) {
  let base = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  if (base.length < 3 || RESERVED.has(base)) base = `boutique${base}`.slice(0, 24);
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? base : `${base}${i}`;
    if (!(await merchantByUsername(candidate))) return candidate;
  }
  return `${base}${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 30);
}

export const keyMode = () => (config.demoMode ? 'test' : 'live');
export const lightningAddress = (m) => `${m.username}@${config.publicHost.replace(/:\d+$/, '')}`;

// password absent (compte créé avec Google) : pas de mot de passe tant que le marchand n'en choisit pas un.
// googleSub : l'adresse a déjà été vérifiée par Google, elle est confirmée d'emblée.
export async function createMerchant({ name, email, password, username, phone, googleSub = null }, client) {
  const m = await one(
    `INSERT INTO merchants (id, name, username, email, password_hash, phone, webhook_secret, publishable_key, fee_bps, google_sub, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      newId('mer'),
      name,
      username,
      email.toLowerCase(),
      password ? await hashPassword(password) : null,
      phone || null,
      `whsec_${randomToken(24)}`,
      `pk_${keyMode()}_${randomToken(18)}`,
      config.feeBps,
      googleSub,
      googleSub ? new Date() : null,
    ],
    client,
  );
  return m;
}

export const merchantByGoogleSub = (sub) => one('SELECT * FROM merchants WHERE google_sub = $1', [String(sub || '')]);

export const merchantById = (id, client) => one('SELECT * FROM merchants WHERE id = $1', [id], client);
export const merchantByEmail = (email) => one('SELECT * FROM merchants WHERE email = $1', [String(email || '').toLowerCase()]);
export const staffByEmail = (email) => one('SELECT * FROM staff WHERE email = $1 AND disabled_at IS NULL', [String(email || '').toLowerCase()]);
export const emailTaken = async (email) =>
  Boolean(await one('SELECT 1 FROM merchants WHERE email = $1 UNION SELECT 1 FROM staff WHERE email = $1', [String(email || '').toLowerCase()]));
export const merchantByUsername = (u) => one('SELECT * FROM merchants WHERE username = $1', [String(u || '').toLowerCase()]);

// ── Clés API ────────────────────────────────────────────────────────────────
export async function createApiKey(merchantId, label = 'Clé secrète', { rawKey } = {}, client) {
  const key = rawKey || `sk_${keyMode()}_${randomToken(24)}`;
  const row = await one(
    `INSERT INTO api_keys (id, merchant_id, label, prefix, key_hash) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key_hash) DO UPDATE SET revoked_at = NULL RETURNING id, label, prefix, created_at`,
    [newId('key'), merchantId, label.slice(0, 40), `${key.slice(0, 12)}…`, sha256(key)],
    client,
  );
  return { ...row, key };
}

export const listApiKeys = (merchantId) =>
  many('SELECT id, label, prefix, created_at, last_used_at FROM api_keys WHERE merchant_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC', [merchantId]);

export async function revokeApiKey(merchantId, id) {
  const r = await query('UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND merchant_id = $2 AND revoked_at IS NULL', [id, merchantId]);
  return r.rowCount > 0;
}

// Résout une clé (sk_… secrète ou pk_… publique) → { merchant, scope }
export async function merchantByKey(key) {
  if (!key || typeof key !== 'string' || key.length > 200) return null;
  if (key.startsWith('pk_')) {
    const m = await one('SELECT * FROM merchants WHERE publishable_key = $1', [key]);
    return m ? { merchant: m, scope: 'publishable' } : null;
  }
  if (!key.startsWith('sk_')) return null;
  const row = await one(
    `UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1 AND revoked_at IS NULL RETURNING merchant_id`,
    [sha256(key)],
  );
  if (!row) return null;
  const m = await merchantById(row.merchant_id);
  return m ? { merchant: m, scope: 'secret' } : null;
}

// ── Sessions ────────────────────────────────────────────────────────────────
export async function createSession(merchantId, req, staffId = null) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.security.sessionDays * 86_400_000);
  await query('INSERT INTO sessions (token_hash, merchant_id, ip, user_agent, expires_at, staff_id) VALUES ($1, $2, $3, $4, $5, $6)', [
    sha256(token),
    merchantId,
    req.ip,
    String(req.get('user-agent') || '').slice(0, 200),
    expires,
    staffId,
  ]);
  return { token, expires };
}

export async function merchantBySession(token) {
  if (!token) return null;
  // Session du propriétaire, ou d'un caissier actif (staff_id renseigné)
  return one(
    `SELECT m.*, s.staff_id, st.name AS staff_name, st.email AS staff_email, st.role AS staff_role
     FROM sessions s JOIN merchants m ON m.id = s.merchant_id LEFT JOIN staff st ON st.id = s.staff_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND (s.staff_id IS NULL OR st.disabled_at IS NULL)`,
    [sha256(token)],
  );
}

export const destroySession = (token) => query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token || '')]);
export const destroyAllSessions = (merchantId) => query('DELETE FROM sessions WHERE merchant_id = $1', [merchantId]);

// Vue publique du marchand (jamais de secret)
export function merchantView(m) {
  return {
    id: m.id,
    name: m.name,
    username: m.username,
    email: m.email,
    phone: m.phone,
    lightning_address: lightningAddress(m),
    public_url: `${config.publicUrl}/@${m.username}`,
    webhook_url: m.webhook_url,
    publishable_key: m.publishable_key,
    fee_bps: m.fee_bps,
    auto_convert_pct: m.auto_convert_pct,
    savings_pct: m.savings_pct,
    payout: m.payout_network ? { network: m.payout_network, phone: m.payout_phone, name: m.payout_name } : null,
    mode: config.demoMode ? 'demo' : 'live',
    payout_mode: config.payouts.mode,
    auto_payout: { enabled: m.auto_payout_enabled, min_xof: m.auto_payout_min_xof },
    has_payout_pin: Boolean(m.payout_pin_hash),
    staff: m.staff_id ? { id: m.staff_id, name: m.staff_name, email: m.staff_email, role: m.staff_role } : null,
    is_demo: m.is_demo,
    email_verified: Boolean(m.email_verified_at),
    has_password: Boolean(m.password_hash),
    google_linked: Boolean(m.google_sub),
    verification: { status: m.verification_status, note: m.verification_note },
    real_money: realMoney(),
    is_admin: !m.staff_id && config.adminEmails.includes(String(m.email).toLowerCase()),
    created_at: m.created_at,
  };
}

export { tx };
