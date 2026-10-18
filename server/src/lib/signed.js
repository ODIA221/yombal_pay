// Jetons signés (HMAC-SHA256) à durée limitée : lien de confirmation d'e-mail, état de la connexion Google.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { safeEqual } from './security.js';

const mac = (body) => crypto.createHmac('sha256', config.signingSecret).update(body).digest('base64url');

export function signToken(data, ttlMs) {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlMs })).toString('base64url');
  return `${body}.${mac(body)}`;
}

// Renvoie les données, ou null si le jeton est absent, falsifié ou expiré
export function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !safeEqual(sig, mac(body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
