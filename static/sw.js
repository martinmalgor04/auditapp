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

/** Ícono de marca SyS para las notificaciones push. */
const PUSH_ICON = '/icons/icon-192.png';
const PUSH_BADGE = '/icons/icon-192.png';

/**
 * Handler push: parsea el PushPayload, muestra la notificación branded SyS. R7
 * Tolera payload inválido sin romper.
 */
self.addEventListener('push', (event) => {
  let payload = null;
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    // payload inválido: silencioso
  }

  if (!payload || !payload.title) {
    return;
  }

  const title = payload.title;
  const options = {
    body: payload.body ?? '',
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
    tag: payload.tag ?? undefined,
    data: { url: payload.url ?? '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Handler click en notificación: abre/enfoca la ruta del payload. R8
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Reusar ventana existente si la hay
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
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
