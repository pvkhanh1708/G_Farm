// Minimal service worker: lets Android offer "Install app". It caches nothing on
// purpose, so every launch loads the current build and talks to the live API.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
