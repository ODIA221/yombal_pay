import crypto from "node:crypto";
import { config } from "./config.js";

/* ---------- Mots de passe (scrypt, sel aléatoire) ---------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const a = crypto.scryptSync(String(password), salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Clés API et secrets ---------- */

export const hashApiKey = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
export const newApiKey = () => "sk_test_" + crypto.randomBytes(20).toString("hex");
export const newWebhookSecret = () => "whsec_" + crypto.randomBytes(24).toString("hex");
export const newMerchantId = () => "mer_" + crypto.randomBytes(8).toString("hex");
export const keyHint = (key) => `${key.slice(0, 8)}…${key.slice(-4)}`;

/* ---------- Session : cookie signé "id.expiration.signature" ---------- */

const COOKIE = "yp_session";
const SESSION_DAYS = 7;

function sign(value) {
  return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

export function setSession(req, res, merchantId) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const value = `${merchantId}.${exp}`;
  res.cookie(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: SESSION_DAYS * 86_400_000,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

/* ---------- Cookies signés de courte durée (connexion Google) ---------- */

export function setSignedCookie(req, res, name, data, maxAgeMs) {
  const value = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + maxAgeMs })).toString("base64url");
  res.cookie(name, `${value}.${sign(value)}`, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: maxAgeMs, path: "/" });
}

export function readSignedCookie(req, name) {
  if (!config.sessionSecret) return null;
  const raw = (req.get("cookie") || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="));
  if (!raw) return null;
  const [value, sig] = decodeURIComponent(raw.slice(name.length + 1)).split(".");
  if (!value || !sig) return null;
  const expected = Buffer.from(sign(value));
  const received = Buffer.from(sig);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

/* ---------- Jetons signés pour les liens envoyés par email ---------- */

export function signToken(data, ttlMs) {
  const value = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlMs })).toString("base64url");
  return `${value}.${sign(value)}`;
}

export function verifyToken(token) {
  const [value, sig] = String(token || "").split(".");
  if (!value || !sig || !config.sessionSecret) return null;
  const expected = Buffer.from(sign(value));
  const received = Buffer.from(sig);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export function clearCookie(res, name) {
  res.clearCookie(name, { path: "/" });
}

export function readSession(req) {
  if (!config.sessionSecret) return null;
  const raw = (req.get("cookie") || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const [id, exp, sig] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const received = Buffer.from(sig);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received) ? id : null;
}
