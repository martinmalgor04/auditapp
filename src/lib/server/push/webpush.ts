import webpush from 'web-push';
import { getVapidConfig } from '$lib/server/env';
import type { PushPayload } from './index';

let _initialized = false;

function ensureInitialized(): boolean {
  if (_initialized) {
    return true;
  }
  const config = getVapidConfig();
  if (!config) {
    return false;
  }
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  _initialized = true;
  return true;
}

/** Verdadero si las claves VAPID están configuradas. R12 */
export function isPushEnabled(): boolean {
  return getVapidConfig() !== null;
}

/** Envía a una suscripción; propaga statusCode para que el caller distinga 404/410. */
export async function send(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload
): Promise<{ statusCode: number }> {
  ensureInitialized();
  const result = await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: sub.keys
    },
    JSON.stringify(payload)
  );
  return { statusCode: result.statusCode };
}
