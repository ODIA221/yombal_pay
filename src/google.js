// Connexion avec Google : OAuth 2.0 / OpenID Connect, flux « authorization code », sans bibliothèque.
import crypto from "node:crypto";
import { config } from "./config.js";

export const googleEnabled = () => Boolean(config.google.clientId && config.google.clientSecret);

export function googleAuthUrl({ redirectUri, state, nonce }) {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export const randomToken = () => crypto.randomBytes(16).toString("hex");

export class GoogleAuthError extends Error {}

// Échange le code contre un id_token et renvoie le profil vérifié.
// Le jeton vient directement de Google, en HTTPS et avec notre secret client : on peut lire son contenu
// sans vérifier sa signature (recommandation de Google pour ce flux), mais on contrôle ses champs.
export async function googleProfileFromCode({ code, redirectUri, nonce }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) {
    throw new GoogleAuthError(`Google a refusé la connexion (${data.error_description || data.error || res.status}).`);
  }

  const payload = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString());
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw new GoogleAuthError("Jeton Google invalide (émetteur).");
  if (payload.aud !== config.google.clientId) throw new GoogleAuthError("Jeton Google invalide (destinataire).");
  if (payload.exp * 1000 < Date.now()) throw new GoogleAuthError("Jeton Google expiré, réessayez.");
  if (payload.nonce !== nonce) throw new GoogleAuthError("Jeton Google invalide (nonce).");
  if (!payload.email || payload.email_verified !== true) {
    throw new GoogleAuthError("Votre adresse Google n'est pas vérifiée. Utilisez l'inscription par email.");
  }

  return { sub: payload.sub, email: String(payload.email).toLowerCase(), name: payload.name || payload.given_name || "" };
}
