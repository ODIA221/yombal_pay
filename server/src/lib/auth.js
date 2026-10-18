// Authentification : clé API (Bearer sk_… / pk_…) pour l'API, cookie de session HttpOnly pour le tableau de bord,
// jeton de session (Bearer ymb_…) pour l'application mobile.
import { config } from '../config.js';
import { merchantByKey, merchantBySession } from './merchants.js';

export const SESSION_COOKIE = 'yp_session';
// Préfixe des jetons de session remis à l'application mobile (même session que le cookie, transportée autrement)
export const MOBILE_TOKEN_PREFIX = 'ymb_';

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setSessionCookie(res, token, expires) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.security.cookieSecure,
    expires,
    path: '/',
  });
}

export const clearSessionCookie = (res) =>
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.security.cookieSecure, path: '/' });

function bearer(req) {
  const h = req.get('authorization') || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  return req.get('x-api-key') || null;
}

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

// Anti-CSRF pour les requêtes authentifiées par cookie : en-tête personnalisé (impossible cross-site
// sans pré-vol CORS, que nous n'autorisons pas avec cookies) + vérification de l'Origin.
function csrfOk(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.get('x-yombalpay-csrf') !== '1') return false;
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return host === req.get('host') || host === config.publicHost;
  } catch {
    return false;
  }
}

async function resolve(req) {
  const key = bearer(req);
  if (key?.startsWith(MOBILE_TOKEN_PREFIX)) {
    const token = key.slice(MOBILE_TOKEN_PREFIX.length);
    const m = await merchantBySession(token);
    // Jeton expiré ou révoqué : même réponse qu'une clé invalide (l'app mobile renvoie vers la connexion)
    return m ? { merchant: m, via: m.staff_id ? 'staff' : 'session', token, mobile: true } : { invalidKey: true };
  }
  if (key) {
    const found = await merchantByKey(key);
    return found ? { merchant: found.merchant, via: found.scope === 'secret' ? 'secret_key' : 'publishable_key' } : { invalidKey: true };
  }
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const m = await merchantBySession(token);
    if (m) return { merchant: m, via: m.staff_id ? 'staff' : 'session', token };
  }
  return null;
}

// allow : liste des moyens acceptés parmi 'session', 'secret_key', 'publishable_key'
export const authenticate = (allow = ['session', 'secret_key']) => async (req, res, next) => {
  try {
    const r = await resolve(req);
    if (r?.invalidKey) return fail(res, 401, 'unauthorized', 'Clé API invalide ou révoquée.');
    if (!r) return fail(res, 401, 'unauthorized', 'Authentification requise.');
    if (!allow.includes(r.via)) {
      const msg =
        r.via === 'publishable_key'
          ? 'Cette action exige la clé secrète (sk_…), à garder côté serveur.'
          : r.via === 'staff'
            ? 'Action réservée au propriétaire du compte.'
            : 'Cette action doit être faite depuis le tableau de bord connecté.';
      return fail(res, 403, 'forbidden', msg);
    }
    // Le CSRF ne concerne que le cookie (envoyé tout seul par le navigateur) ; un jeton Bearer ne l'est jamais
    if ((r.via === 'session' || r.via === 'staff') && !r.mobile && !csrfOk(req)) return fail(res, 403, 'csrf', 'Requête refusée (protection CSRF).');
    req.merchant = r.merchant;
    req.authVia = r.via;
    req.sessionToken = r.token;
    req.mobile = Boolean(r.mobile);
    req.staff = r.via === 'staff' ? { id: r.merchant.staff_id, name: r.merchant.staff_name } : null;
    next();
  } catch (err) {
    next(err);
  }
};

// Identifie le marchand s'il est authentifié (clé secrète ou session), sans l'exiger
export const optionalAuth = async (req, _res, next) => {
  try {
    const r = await resolve(req);
    if (r?.merchant && (r.via === 'session' || r.via === 'secret_key')) req.merchant = r.merchant;
  } catch {}
  next();
};
