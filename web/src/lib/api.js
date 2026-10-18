// Client HTTP du front : cookie de session (même origine) + en-tête anti-CSRF sur les écritures.
export class ApiError extends Error {
  constructor(message, status, code, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields; // { champ: message } quand le serveur détaille les champs à corriger
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-YombalPay-CSRF'] = '1';
  const res = await fetch(path, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json?.error?.message || `Erreur ${res.status}`, res.status, json?.error?.code, json?.error?.fields);
  return json;
}

// EventSource avec repli automatique sur l'interrogation périodique
export function live(url, onEvent, { fallback, intervalMs = 4000, events = ['status', 'checkout', 'delivery', 'balance', 'payout'] } = {}) {
  let es;
  let timer;
  let closed = false;
  try {
    es = new EventSource(url, { withCredentials: true });
    events.forEach((t) => es.addEventListener(t, (e) => onEvent(t, JSON.parse(e.data))));
  } catch {}
  if (fallback) {
    const loop = async () => {
      if (closed) return;
      try {
        await fallback();
      } catch {}
      timer = setTimeout(loop, intervalMs);
    };
    timer = setTimeout(loop, intervalMs);
  }
  return () => {
    closed = true;
    es?.close();
    clearTimeout(timer);
  };
}
