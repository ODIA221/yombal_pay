// Adresse de la machine sur le réseau local (Wi-Fi / Ethernet), pour les liens ouverts depuis un téléphone.
// Utilisée quand PUBLIC_URL_AUTO=true : l'adresse suit les changements de connexion sans redémarrage.
import os from 'node:os';

const PREFERRED = /^(en\d|eth\d|wlan\d|wlp|enp|Wi-?Fi|Ethernet)/i;

export function lanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      candidates.push({ name, address: a.address, preferred: PREFERRED.test(name) });
    }
  }
  // Interfaces Wi-Fi / Ethernet d'abord (pas les VPN, Docker ou ponts virtuels)
  candidates.sort((x, y) => Number(y.preferred) - Number(x.preferred));
  return candidates[0]?.address ?? null;
}

// Appelle onChange(ip) au démarrage puis à chaque changement d'adresse
export function watchLanIp(onChange, everyMs = 5000) {
  let last = null;
  const tick = () => {
    const ip = lanIp();
    if (ip && ip !== last) {
      last = ip;
      onChange(ip);
    }
  };
  tick();
  return setInterval(tick, everyMs).unref?.();
}
