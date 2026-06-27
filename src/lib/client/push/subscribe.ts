/**
 * Cliente push PWA (#53).
 * Pide permiso, suscribe/desuscribe y persiste la preferencia notify_push del usuario.
 * Consumido por el toggle de perfil (#48).
 */

/** Obtiene la clave pública VAPID del servidor. */
async function fetchPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/public-key');
    if (!res.ok) {
      return null;
    }
    const data: { success: boolean; data: { publicKey: string | null } } = await res.json();
    return data.data?.publicKey ?? null;
  } catch {
    return null;
  }
}

/** Convierte una base64url a Uint8Array (para applicationServerKey). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/** Registra el service worker y devuelve su registration, o null si no disponible. */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Suscribe el dispositivo al push:
 * 1. Pide permiso al navegador.
 * 2. Suscribe con pushManager usando la clave pública VAPID.
 * 3. Registra la suscripción en /api/push/subscribe.
 * 4. Devuelve true si tuvo éxito.
 */
export async function subscribePush(): Promise<boolean> {
  const publicKey = await fetchPublicKey();
  if (!publicKey) {
    // Sin clave VAPID configurada: modo no-op silencioso.
    return false;
  }

  if (typeof Notification === 'undefined') {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return false;
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return false;
  }

  const applicationServerKey = urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  });

  const subJson = subscription.toJSON();
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh ?? '',
        auth: subJson.keys?.auth ?? ''
      }
    })
  });

  return res.ok;
}

/**
 * Desuscribe el dispositivo del push:
 * 1. Obtiene la suscripción activa.
 * 2. Da de baja en /api/push/subscribe.
 * 3. Cancela la suscripción en el navegador.
 * 4. Devuelve true si tuvo éxito.
 */
export async function unsubscribePush(): Promise<boolean> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return false;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return true; // ya desuscripto
  }

  const endpoint = subscription.endpoint;

  // Primero dar de baja en el servidor
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint })
  });

  // Luego cancelar en el navegador
  await subscription.unsubscribe();
  return true;
}

/** Devuelve true si el dispositivo tiene una suscripción activa. */
export async function isPushSubscribed(): Promise<boolean> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return false;
  }
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}
