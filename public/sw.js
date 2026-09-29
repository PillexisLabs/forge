const VERSION = 'forge-pwa-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Keep authenticated dashboard pages and API responses network-only.
// The handler does not call respondWith, so the browser fetches every
// request itself. Answering with fetch(event.request) broke navigations
// that redirect (for example / to /work) and any request while the server
// restarted, both shown as ERR_FAILED.
self.addEventListener('fetch', () => {});
