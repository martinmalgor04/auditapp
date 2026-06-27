import { z } from 'zod';
import type { RequestHandler } from './$types';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import {
  upsertPushSubscription,
  deletePushSubscriptionByEndpoint
} from '$lib/server/db/push-subscription';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url()
});

/** POST — Alta / upsert de suscripción push (R4, R6). */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return apiError('No autorizado', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Body JSON inválido', 400);
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Datos de suscripción inválidos', 400);
  }

  const ua = request.headers.get('user-agent');
  const result = await upsertPushSubscription(user.id, parsed.data, ua);
  return apiSuccess({ id: result.id });
};

/** DELETE — Baja de suscripción push (R5, R6). */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return apiError('No autorizado', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Body JSON inválido', 400);
  }

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Endpoint inválido', 400);
  }

  await deletePushSubscriptionByEndpoint(user.id, parsed.data.endpoint);
  return apiSuccess({ ok: true });
};
