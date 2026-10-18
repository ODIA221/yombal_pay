// Comptes marchands : inscription, connexion (e-mail ou Google), confirmation d'e-mail, déconnexion, mot de passe.
import express from 'express';
import { config } from '../config.js';
import { one, tx } from '../db/pool.js';
import { authenticate, clearSessionCookie, MOBILE_TOKEN_PREFIX, readCookie, setSessionCookie } from '../lib/auth.js';
import { GoogleAuthError, googleAuthUrl, googleEnabled, googleProfileFromCode } from '../lib/google.js';
import { signToken, verifyToken } from '../lib/signed.js';
import { confirmEmailToken, sendConfirmation } from '../lib/verification.js';
import {
  availableUsername,
  reclaimAccount,
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
import { audit, burnPasswordCheck, hashPassword, randomToken, rateLimit, sha256, verifyPassword } from '../lib/security.js';
import { sendMail } from '../lib/mailer.js';
import { resetPasswordEmail } from '../lib/emails.js';
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
    // Identifiant facultatif (API) : sans lui, il est tiré du nom du commerce
    let handle;
    if (username) {
      const u = validateUsername(username);
      if (u.error) return fail(res, 422, 'invalid_username', u.error);
      if (await merchantByUsername(u.value)) return fail(res, 409, 'username_taken', 'Cet identifiant est déjà pris.');
      handle = u.value;
    } else handle = await availableUsername(shopName);
    if (await emailTaken(email)) return fail(res, 409, 'email_taken', 'Un compte existe déjà avec cet e-mail.');

    const { merchant, key } = await tx(async (client) => {
      const m = await createMerchant({ name: shopName, email: String(email).trim(), password, username: handle, phone }, client);
      const k = await createApiKey(m.id, 'Clé par défaut', {}, client);
      return { merchant: m, key: k };
    });
    const s = await createSession(merchant.id, req);
    setSessionCookie(res, s.token, s.expires);
    await audit(merchant.id, 'signup', req);
    sendConfirmation(merchant);
    // La clé secrète n'est montrée qu'une seule fois
    res.status(201).json({ merchant: merchantView(merchant), secret_key: key.key });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'conflict', 'E-mail ou identifiant déjà utilisé.');
    next(err);
  }
});

// Moyens de connexion proposés par la page de connexion
authRouter.get('/options', (_req, res) => res.json({ google: googleEnabled() }));

// ── Confirmation de l'adresse e-mail ────────────────────────────────────────
// Lien reçu par e-mail : confirme l'adresse puis renvoie vers l'espace marchand
authRouter.get('/confirm-email', async (req, res, next) => {
  try {
    const r = await confirmEmailToken(req.query.token);
    if (!r) return res.redirect(303, '/login?email=invalide');
    await audit(r.merchant.id, 'email_confirmed', req);
    res.redirect(303, '/app?email=confirme');
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  '/resend-confirmation',
  authenticate(['session']),
  rateLimit({ name: 'resend-confirmation', limit: 1, windowMs: 60_000, key: (req) => req.merchant.id }),
  async (req, res) => {
    if (req.merchant.email_verified_at) return res.json({ ok: true, already: true });
    await sendConfirmation(req.merchant);
    res.json({ ok: true, sent_to: req.merchant.email });
  },
);

// ── Mot de passe oublié ─────────────────────────────────────────────────────
// Le jeton porte une empreinte du mot de passe actuel : il ne sert qu'une fois (le mot de passe change).
const RESET_TTL_MS = 3_600_000;
const passwordFingerprint = (m) => sha256(`${m.id}:${m.password_hash || 'aucun'}`).slice(0, 24);

authRouter.post(
  '/forgot',
  rateLimit({ name: 'forgot-ip', limit: 10, windowMs: 3_600_000 }),
  rateLimit({ name: 'forgot-email', limit: 3, windowMs: 3_600_000, key: (req) => String(req.body?.email || '').toLowerCase() }),
  async (req, res, next) => {
    try {
      const m = await merchantByEmail(String(req.body?.email || '').trim());
      if (m) {
        const token = signToken({ purpose: 'reset', id: m.id, fp: passwordFingerprint(m) }, RESET_TTL_MS);
        sendMail({ to: m.email, ...resetPasswordEmail({ name: m.name, link: `${config.publicUrl}/reset?token=${encodeURIComponent(token)}` }) });
        await audit(m.id, 'password_reset_requested', req);
      }
      // Même réponse que le compte existe ou non : la page ne révèle pas les adresses inscrites
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post('/reset', rateLimit({ name: 'reset', limit: 10, windowMs: 900_000 }), async (req, res, next) => {
  try {
    const data = verifyToken(req.body?.token);
    const m = data?.purpose === 'reset' ? await one('SELECT * FROM merchants WHERE id = $1', [data.id]) : null;
    if (!m || data.fp !== passwordFingerprint(m)) return fail(res, 400, 'invalid_token', 'Ce lien est invalide, expiré ou déjà utilisé. Demandez-en un nouveau.');
    const pwErr = checkPassword(req.body?.password);
    if (pwErr) return fail(res, 422, 'weak_password', pwErr);
    const hash = await hashPassword(req.body.password);
    const reclaimed = await tx(async (client) => {
      // Le lien est arrivé dans la boîte mail : l'adresse appartient à cette personne
      const r = await reclaimAccount(m.id, client);
      await client.query('UPDATE merchants SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [m.id, hash]);
      await client.query('DELETE FROM sessions WHERE merchant_id = $1', [m.id]);
      return r;
    });
    // Journal après la transaction : il référence le compte, verrouillé pendant celle-ci
    if (reclaimed) await audit(m.id, 'account_reclaimed', req, { via: 'reset' });
    await audit(m.id, 'password_reset', req);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Connexion avec Google ───────────────────────────────────────────────────
const OAUTH_COOKIE = 'yp_oauth';
const googleRedirectUri = () => `${config.publicUrl}/v1/auth/google/callback`;
const shortCookie = (res, name, value, ttlMs) =>
  res.cookie(name, value, { httpOnly: true, sameSite: 'lax', secure: config.security.cookieSecure, maxAge: ttlMs, path: '/v1/auth' });
// Après connexion : la page d'accueil, qui fige l'historique pour que « Retour » n'y ramène pas Google
const AFTER_LOGIN = '/?connecte=1';
// Erreur affichée par la page de connexion : un code connu d'elle, jamais un texte libre (pas de faux message)
const loginError = (res, code) => res.redirect(303, `/login?erreur=${code}`);

authRouter.get('/google', (_req, res) => {
  if (!googleEnabled()) return loginError(res, 'google_config');
  const state = randomToken(16);
  const nonce = randomToken(16);
  shortCookie(res, OAUTH_COOKIE, signToken({ purpose: 'oauth', state, nonce }, 10 * 60_000), 10 * 60_000);
  res.redirect(303, googleAuthUrl({ redirectUri: googleRedirectUri(), state, nonce }));
});

authRouter.get('/google/callback', async (req, res, next) => {
  const pending = verifyToken(readCookie(req, OAUTH_COOKIE));
  res.clearCookie(OAUTH_COOKIE, { path: '/v1/auth' });
  if (req.query.error) return loginError(res, 'google_annule');
  if (pending?.purpose !== 'oauth' || !req.query.code || req.query.state !== pending.state) return loginError(res, 'google_expire');
  try {
    const profile = await googleProfileFromCode({ code: String(req.query.code), redirectUri: googleRedirectUri(), nonce: pending.nonce });
    // Compte déjà lié à Google, ou compte existant avec la même adresse (vérifiée par Google) : on le lie.
    // Compte jamais confirmé : Google prouve que l'adresse est à cette personne, tout réglage d'un éventuel
    // squatteur est effacé (reclaimAccount) avant de lui ouvrir le compte.
    let m = await one('SELECT * FROM merchants WHERE google_sub = $1', [profile.sub]);
    if (!m) {
      let reclaimed = false;
      m = await tx(async (client) => {
        const byEmail = await one('SELECT id FROM merchants WHERE email = $1 AND google_sub IS NULL', [profile.email], client);
        if (!byEmail) return null;
        reclaimed = await reclaimAccount(byEmail.id, client);
        return one(
          'UPDATE merchants SET google_sub = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 RETURNING *',
          [byEmail.id, profile.sub],
          client,
        );
      });
      // Journal après la transaction : il référence le compte, verrouillé pendant celle-ci
      if (reclaimed) await audit(m.id, 'account_reclaimed', req, { via: 'google' });
    }
    if (m) {
      const s = await createSession(m.id, req);
      setSessionCookie(res, s.token, s.expires);
      await audit(m.id, 'login_google', req);
      return res.redirect(303, AFTER_LOGIN);
    }
    if (await staffByEmail(profile.email)) return loginError(res, 'caissier');
    // Nouveau marchand : compte créé tout de suite, au nom du profil Google (modifiable dans Réglages).
    // Pas de clé API d'office : le marchand en crée une dans « Développeurs » s'il intègre un site.
    const name = (profile.name || profile.email.split('@')[0]).trim().slice(0, 60);
    m = await createMerchant({ name, email: profile.email, username: await availableUsername(name), googleSub: profile.sub });
    const s = await createSession(m.id, req);
    setSessionCookie(res, s.token, s.expires);
    await audit(m.id, 'signup_google', req);
    res.redirect(303, AFTER_LOGIN);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      console.warn(`Connexion Google refusée : ${err.message}`);
      return loginError(res, err.code);
    }
    // Même compte créé au même instant par un double clic : on renvoie vers la connexion Google
    if (err.code === '23505') return res.redirect(303, '/v1/auth/google');
    next(err);
  }
});

authRouter.post(
  '/login',
  rateLimit({ name: 'login-ip', limit: 30, windowMs: 900_000 }),
  // Par e-mail ET adresse IP : un inconnu qui se trompe exprès ne bloque que lui, pas le vrai propriétaire.
  // Plafond large par e-mail seul : une attaque répartie sur beaucoup d'IP reste freinée.
  rateLimit({ name: 'login-email-ip', limit: 8, windowMs: 900_000, key: (req) => `${String(req.body?.email || '').toLowerCase()}|${req.ip}` }),
  rateLimit({ name: 'login-email', limit: 50, windowMs: 900_000, key: (req) => String(req.body?.email || '').toLowerCase() }),
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
      // Application mobile : le jeton est rendu dans la réponse (gardé dans le stockage sécurisé du téléphone)
      const mobile = req.body?.client === 'mobile';
      if (!mobile) setSessionCookie(res, s.token, s.expires);
      await audit(merchantId, st ? 'staff_login' : 'login', req, { ...(st ? { staff: st.id, name: st.name } : {}), ...(mobile ? { client: 'mobile' } : {}) });
      res.json({
        merchant: merchantView(await merchantBySession(s.token)),
        ...(mobile ? { token: `${MOBILE_TOKEN_PREFIX}${s.token}`, expires_at: s.expires } : {}),
      });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post('/logout', authenticate(['session', 'staff']), async (req, res) => {
  await destroySession(req.sessionToken);
  if (!req.mobile) clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', authenticate(['session', 'staff']), (req, res) => res.json({ merchant: merchantView(req.merchant) }));

authRouter.post('/password', authenticate(['session']), rateLimit({ name: 'pw', limit: 5, windowMs: 900_000 }), async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    // Compte créé avec Google : il choisit son premier mot de passe (exigé pour retirer et débloquer l'épargne)
    if (req.merchant.password_hash && !(await verifyPassword(String(current_password || ''), req.merchant.password_hash)))
      return fail(res, 401, 'invalid_credentials', 'Mot de passe actuel incorrect.');
    const pwErr = checkPassword(new_password);
    if (pwErr) return fail(res, 422, 'weak_password', pwErr);
    await query('UPDATE merchants SET password_hash = $2 WHERE id = $1', [req.merchant.id, await hashPassword(new_password)]);
    // Déconnecte toutes les autres sessions, garde la session courante
    await destroyAllSessions(req.merchant.id);
    const s = await createSession(req.merchant.id, req);
    await audit(req.merchant.id, 'password_changed', req);
    if (req.mobile) return res.json({ ok: true, token: `${MOBILE_TOKEN_PREFIX}${s.token}` });
    setSessionCookie(res, s.token, s.expires);
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
