// Client de l'API YombalPay pour le mobile : jeton de session « Bearer ymb_… » (pas de cookie, pas de CSRF).
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getItem, removeItem, setItem } from './storage';

const ENV_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
const SERVER_KEY = 'yp_server_url';
const clean = (u) => String(u || '').trim().replace(/\/$/, '');

// Adresse de la passerelle déduite de l'ordinateur qui sert l'application (Metro, port 8081 → passerelle, port 3000).
// Elle suit automatiquement les changements de Wi-Fi : nouveau réseau, nouvelle adresse, sans rien régler.
function autoUrl() {
  if (Platform.OS === 'web' && typeof location !== 'undefined') return `${location.protocol}//${location.hostname}:3000`;
  const host = Constants.expoConfig?.hostUri || Constants.linkingUri || '';
  const name = host.replace(/^[a-z]+:\/\//i, '').split(/[:/]/)[0];
  return name && name !== 'localhost' ? `http://${name}:3000` : null;
}

let baseUrl = ENV_URL || autoUrl() || 'http://localhost:3000';
let token = null;
let onUnauthorized = () => {};

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const getBaseUrl = () => baseUrl;
export const setToken = (t) => (token = t);
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

async function reachable(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    return (await fetch(`${url}/v1/health`, { signal: ctrl.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Au démarrage : l'adresse saisie à la main, puis celle de l'ordinateur qui sert l'app, puis celle du .env.
// La première qui répond est retenue (une adresse enregistrée sur un ancien Wi-Fi ne bloque plus l'app).
export async function loadServerUrl() {
  const candidates = [...new Set([clean(await getItem(SERVER_KEY)), autoUrl(), ENV_URL].filter(Boolean))];
  for (const url of candidates) {
    if (await reachable(url)) return (baseUrl = url);
  }
  baseUrl = candidates[0] || baseUrl;
  return baseUrl;
}

// Adresse choisie à la main sur l'écran de connexion (vide = retour à la détection automatique)
export async function saveServerUrl(url) {
  const u = clean(url);
  if (!u) {
    await removeItem(SERVER_KEY);
    return loadServerUrl();
  }
  baseUrl = u;
  await setItem(SERVER_KEY, baseUrl);
  return baseUrl;
}

// Changement de réseau en cours d'utilisation : on cherche de nouveau la passerelle
export const rediscover = () => loadServerUrl();

async function send(path, { method, body, timeoutMs, auth }) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  // AbortSignal.timeout n'existe pas partout en React Native : minuteur classique
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function api(path, { method = 'GET', body, timeoutMs = 15000, auth = true } = {}) {
  const opts = { method, body, timeoutMs, auth };
  let res;
  try {
    res = await send(path, opts);
  } catch {
    // Réseau changé (nouveau Wi-Fi) : on cherche de nouveau la passerelle et on réessaie une fois.
    // Seulement pour les lectures : un envoi (paiement, retrait) n'est jamais rejoué à l'aveugle.
    const before = baseUrl;
    if (method === 'GET' && (await loadServerUrl()) !== before) {
      try {
        res = await send(path, opts);
      } catch {}
    }
    if (!res) throw new ApiError(`Serveur injoignable (${baseUrl}). Le téléphone est-il sur le même Wi-Fi que l'ordinateur ?`, 0, 'network');
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const message = json?.error?.message || `Erreur ${res.status}`;
    // Session expirée ou révoquée : retour à l'écran de connexion (sauf pendant la connexion elle-même)
    if (res.status === 401 && auth && token && json?.error?.code === 'unauthorized') onUnauthorized();
    throw new ApiError(message, res.status, json?.error?.code);
  }
  return json;
}

// Adresses web servies par la passerelle (reçu, page de paiement), ouvertes dans le navigateur du téléphone
export const webUrl = (path) => `${baseUrl}${path}`;
