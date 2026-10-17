// Primitives de sécurité : mots de passe (scrypt), jetons, limitation de débit, validation d'URL, journal d'audit.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { query } from '../db/pool.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, n, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { ...SCRYPT, N: Number(n) });
  return crypto.timingSafeEqual(key, expected);
}

// Hash factice : la vérification prend le même temps qu'un compte existe ou non (pas d'énumération des e-mails)
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash);
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ── Limitation de débit (fenêtre glissante en mémoire, par clé) ─────────────
const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 60_000).unref();

export function hit(key, { limit, windowMs }) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return { ok: b.count <= limit, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

export const rateLimit = ({ name, limit, windowMs, key = (req) => req.ip }) => (req, res, next) => {
  const r = hit(`${name}:${key(req)}`, { limit, windowMs });
  if (r.ok) return next();
  res.set('Retry-After', String(r.retryAfter));
  res.status(429).json({ error: { code: 'rate_limited', message: `Trop de tentatives. Réessayez dans ${r.retryAfter} s.` } });
};

// ── Validation d'URL ────────────────────────────────────────────────────────
// URL de retour affichée au client : http(s) uniquement (bloque javascript:, data:…)
export function cleanHttpUrl(value) {
  if (value === undefined || value === null || value === '') return null;
  try {
    const u = new URL(String(value));
    if (!['http:', 'https:'].includes(u.protocol)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

// URL de webhook marchand : protection SSRF (pas d'IP privée en production)
export async function assertSafeWebhookUrl(value) {
  const url = cleanHttpUrl(value);
  if (!url) throw new Error('URL de webhook invalide (http ou https requis).');
  if (config.security.allowPrivateWebhooks) return url;
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('Le webhook doit être en HTTPS.');
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('Nom de domaine du webhook introuvable.');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Le webhook ne peut pas viser un réseau privé.');
  return url;
}

export async function audit(merchantId, action, req, meta = {}) {
  try {
    await query('INSERT INTO audit_log (merchant_id, action, ip, meta) VALUES ($1, $2, $3, $4)', [merchantId, action, req?.ip ?? null, meta]);
  } catch (err) {
    console.warn('Audit impossible :', err.message);
  }
}
