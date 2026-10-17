// Service worker minimal : rend l'application installable, sans mise en cache (les paiements doivent toujours être frais).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
