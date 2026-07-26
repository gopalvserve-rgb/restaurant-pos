// Service worker - v3 - network-first for navigation, cache-first for static assets
const CACHE = 'restaurant-pos-v3';
const SHELL = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache API requests
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/downloads/')) return;
  if (event.request.method !== 'GET') return;

  // Navigation / HTML: network-first, fallback to cache
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone)).catch(() => {});
        return resp;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone)).catch(() => {});
        return resp;
      })
    )
  );
});
