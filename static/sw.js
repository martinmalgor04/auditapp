const CACHE_NAME = 'auditapp-shell-v4';
const PRECACHE_URLS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

function isImmutableAsset(pathname) {
  return pathname.startsWith('/_app/immutable/');
}

/** Datos dinámicos y endpoints SvelteKit: siempre red, nunca cache del SW. */
function isNetworkOnlyRequest(url, request) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.includes('__data.json')) return true;
  if (url.pathname.startsWith('/_app/version.json')) return true;
  if (request.headers.get('x-sveltekit-loader')) return true;
  if (request.headers.get('x-sveltekit-action')) return true;
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isNetworkOnlyRequest(url, event.request)) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ success: false, error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  // SSR: HTML siempre desde red; no cachear páginas con datos embebidos.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((cached) => cached ?? caches.match('/'))
      )
    );
    return;
  }

  // Chunks versionados: cache-first (hash en el nombre → inmutables).
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Manifest / íconos precacheados u otros estáticos pequeños.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request);
    })
  );
});
