// Client de l'API YombalPay pour le mobile : jeton de session « Bearer ymb_… » (pas de cookie, pas de CSRF).
import { getItem, setItem } from './storage';

const DEFAULT_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.5:3000').replace(/\/$/, '');
const SERVER_KEY = 'yp_server_url';

let baseUrl = DEFAULT_URL;
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

export async function loadServerUrl() {
  baseUrl = ((await getItem(SERVER_KEY)) || DEFAULT_URL).replace(/\/$/, '');
  return baseUrl;
}

export async function saveServerUrl(url) {
  baseUrl = String(url).trim().replace(/\/$/, '');
  await setItem(SERVER_KEY, baseUrl);
  return baseUrl;
}

export async function api(path, { method = 'GET', body, timeoutMs = 15000, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  // AbortSignal.timeout n'existe pas partout en React Native : minuteur classique
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
  } catch {
    throw new ApiError(`Serveur injoignable (${baseUrl}). Le téléphone est-il sur le même Wi-Fi que l'ordinateur ?`, 0, 'network');
  } finally {
    clearTimeout(timer);
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
