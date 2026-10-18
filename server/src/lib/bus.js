// Diffusion temps réel (Server-Sent Events) : page de paiement et tableau de bord.
const channels = new Map(); // nom de canal -> Set<res>

// Connexions ouvertes : plafonnées par adresse IP et au total, pour qu'on ne puisse pas épuiser le serveur
const MAX_PER_IP = 20;
const MAX_TOTAL = 5000;
const perIp = new Map();
let total = 0;

// Renvoie false (réponse 429 déjà envoyée) si le plafond est atteint
export function subscribe(channel, req, res) {
  const ip = req.ip || 'inconnue';
  if (total >= MAX_TOTAL || (perIp.get(ip) || 0) >= MAX_PER_IP) {
    res.status(429).json({ error: { code: 'rate_limited', message: 'Trop de connexions en direct ouvertes.' } });
    return false;
  }
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  total += 1;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(res);

  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(ping);
    channels.get(channel)?.delete(res);
    if (!channels.get(channel)?.size) channels.delete(channel);
    total -= 1;
    const n = (perIp.get(ip) || 1) - 1;
    if (n > 0) perIp.set(ip, n);
    else perIp.delete(ip);
  });
  return true;
}

export function publish(channel, event, data) {
  const subs = channels.get(channel);
  if (!subs) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) res.write(msg);
}
