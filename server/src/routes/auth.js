// Comptes marchands : inscription, connexion, déconnexion, changement de mot de passe.
import express from 'express';
import { tx } from '../db/pool.js';
import { authenticate, clearSessionCookie, setSessionCookie } from '../lib/auth.js';
import {
  createApiKey,
  createMerchant,
  createSession,
  destroyAllSessions,
  destroySession,
  emailTaken,
  merchantByEmail,
  merchantBySession,
  merchantByUsername,
  staffByEmail,
  merchantView,
  validateUsername,
} from '../lib/merchants.js';
import { audit, burnPasswordCheck, hashPassword, rateLimit, verifyPassword } from '../lib/security.js';
import { query } from '../db/pool.js';

export const authRouter = express.Router();
authRouter.use(express.json({ limit: '20kb' }));

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (p.length > 200) return 'Mot de passe trop long.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return null;
}

authRouter.post('/signup', rateLimit({ name: 'signup', limit: 10, windowMs: 3_600_000 }), async (req, res, next) => {
  try {
    const { name, email, password, username, phone } = req.body || {};
    const shopName = String(name || '').trim().slice(0, 60);
    if (shopName.length < 2) return fail(res, 422, 'invalid_name', 'Indiquez le nom de votre commerce.');
    if (!EMAIL_RE.test(String(email || ''))) return fail(res, 422, 'invalid_email', 'Adresse e-mail invalide.');
    const pwErr = checkPassword(password);
    if (pwErr) return fail(res, 422, 'weak_password', pwErr);
    const u = validateUsername(username);
    if (u.error) return fail(res, 422, 'invalid_username', u.error);
    if (await emailTaken(email)) return fail(res, 409, 'email_taken', 'Un compte existe déjà avec cet e-mail.');
    if (await merchantByUsername(u.value)) return fail(res, 409, 'username_taken', 'Cet identifiant est déjà pris.');

    const { merchant, key } = await tx(async (client) => {
      const m = await createMerchant({ name: shopName, email: String(email).trim(), password, username: u.value, phone }, client);
      const k = await createApiKey(m.id, 'Clé par défaut', {}, client);
      return { merchant: m, key: k };
    });
    const s = await createSession(merchant.id, req);
    setSessionCookie(res, s.token, s.expires);
    await audit(merchant.id, 'signup', req);
    // La clé secrète n'est montrée qu'une seule fois
    res.status(201).json({ merchant: merchantView(merchant), secret_key: key.key });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'conflict', 'E-mail ou identifiant déjà utilisé.');
    next(err);
  }
});

authRouter.post(
  '/login',
  rateLimit({ name: 'login-ip', limit: 30, windowMs: 900_000 }),
  rateLimit({ name: 'login-email', limit: 8, windowMs: 900_000, key: (req) => String(req.body?.email || '').toLowerCase() }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      const m = await merchantByEmail(email);
      // Pas de propriétaire avec cet e-mail : peut-être un caissier
      const st = m ? null : await staffByEmail(email);
      const account = m || st;
      if (!account) {
        await burnPasswordCheck(String(password || ''));
        return fail(res, 401, 'invalid_credentials', 'E-mail ou mot de passe incorrect.');
      }
      const merchantId = m ? m.id : st.merchant_id;
      if (!(await verifyPassword(String(password || ''), account.password_hash))) {
        await audit(merchantId, 'login_failed', req, st ? { staff: st.id } : {});
        return fail(res, 401, 'invalid_credentials', 'E-mail ou mot de passe incorrect.');
      }
      const s = await createSession(merchantId, req, st?.id ?? null);
      setSessionCookie(res, s.token, s.expires);
      await audit(merchantId, st ? 'staff_login' : 'login', req, st ? { staff: st.id, name: st.name } : {});
      res.json({ merchant: merchantView(await merchantBySession(s.token)) });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post('/logout', authenticate(['session', 'staff']), async (req, res) => {
  await destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', authenticate(['session', 'staff']), (req, res) => res.json({ merchant: merchantView(req.merchant) }));

authRouter.post('/password', authenticate(['session']), rateLimit({ name: 'pw', limit: 5, windowMs: 900_000 }), async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!(await verifyPassword(String(current_password || ''), req.merchant.password_hash)))
      return fail(res, 401, 'invalid_credentials', 'Mot de passe actuel incorrect.');
    const pwErr = checkPassword(new_password);
    if (pwErr) return fail(res, 422, 'weak_password', pwErr);
    await query('UPDATE merchants SET password_hash = $2 WHERE id = $1', [req.merchant.id, await hashPassword(new_password)]);
    // Déconnecte toutes les autres sessions, garde la session courante
    await destroyAllSessions(req.merchant.id);
    const s = await createSession(req.merchant.id, req);
    setSessionCookie(res, s.token, s.expires);
    await audit(req.merchant.id, 'password_changed', req);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout-all', authenticate(['session']), async (req, res) => {
  await destroyAllSessions(req.merchant.id);
  clearSessionCookie(res);
  await audit(req.merchant.id, 'logout_all', req);
  res.json({ ok: true });
});
