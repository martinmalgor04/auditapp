import { getSql } from '$lib/server/db/client';
import {
  listPushSubscriptionsByUserIds,
  deletePushSubscriptionByEndpointAny
} from '$lib/server/db/push-subscription';
import { logger } from '$lib/server/logger';
import { isPushEnabled, send } from './webpush';

export type PushEventName =
  | 'aviso_auditoria_asignada'
  | 'aviso_briefing_completado'
  | 'aviso_informe_aprobado'
  | 'aviso_auditoria_cerrada'
  | 'aviso_feedback_cliente';

export type PushPayload = {
  event: PushEventName;
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export type PushSendResult = {
  attempted: number;
  delivered: number;
  removed: number;
  failed: number;
};

/** Filtra los userIds cuya preferencia notify_push = true. R10 */
async function filterNotifyPushUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) {
    return [];
  }
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM app_user
    WHERE id = ANY(${userIds}::uuid[])
      AND notify_push = true
      AND active = true
  `;
  return rows.map((r) => r.id);
}

/**
 * Envía push a las suscripciones de los usuarios indicados.
 * - No-op si VAPID no está configurado (R12).
 * - Nunca lanza (R13).
 * - Limpia endpoints 404/410 (R11).
 * - Loguea sin exponer claves privadas (R14).
 */
export async function sendPushToUsers(
  userIds: string[],
  event: PushEventName,
  payload: PushPayload
): Promise<PushSendResult> {
  const result: PushSendResult = { attempted: 0, delivered: 0, removed: 0, failed: 0 };

  try {
    // R12: no-op sin VAPID
    if (!isPushEnabled()) {
      logger.info('push_noop_no_vapid', { event, userCount: userIds.length });
      return result;
    }

    // R10: filtrar por preferencia notify_push
    const eligibleUserIds = await filterNotifyPushUsers(userIds);
    if (eligibleUserIds.length === 0) {
      return result;
    }

    const subscriptions = await listPushSubscriptionsByUserIds(eligibleUserIds);
    result.attempted = subscriptions.length;

    if (subscriptions.length === 0) {
      return result;
    }

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const res = await send(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          if (res.statusCode >= 200 && res.statusCode < 300) {
            result.delivered++;
          } else {
            result.failed++;
            logger.warn('push_send_non2xx', { event, statusCode: res.statusCode });
          }
        } catch (err: unknown) {
          const statusCode =
            err && typeof err === 'object' && 'statusCode' in err
              ? (err as { statusCode: number }).statusCode
              : undefined;

          if (statusCode === 404 || statusCode === 410) {
            // R11: endpoint caducado → eliminar suscripción
            result.removed++;
            try {
              await deletePushSubscriptionByEndpointAny(sub.endpoint);
              logger.info('push_subscription_removed', { event, statusCode });
            } catch (delErr) {
              logger.error('push_subscription_remove_failed', { event }, delErr);
            }
          } else {
            result.failed++;
            logger.warn('push_send_failed', { event, statusCode }, err);
          }
        }
      })
    );
  } catch (err) {
    // R13: nunca propaga
    logger.error('push_send_users_failed', { event }, err);
  }

  return result;
}
