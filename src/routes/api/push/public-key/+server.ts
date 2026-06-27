import type { RequestHandler } from './$types';
import { apiSuccess } from '$lib/server/api/envelope';
import { getVapidConfig } from '$lib/server/env';

/** GET — Devuelve la clave pública VAPID para el cliente PWA (R2). Nunca expone la privada. */
export const GET: RequestHandler = async () => {
  const config = getVapidConfig();
  return apiSuccess({ publicKey: config?.publicKey ?? null });
};
