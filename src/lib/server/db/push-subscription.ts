import { getSql } from '$lib/server/db/client';

export type StoredPushSubscription = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Inserta o actualiza la suscripción de un usuario (upsert por endpoint). R4 */
export async function upsertPushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  ua: string | null
): Promise<{ id: string }> {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${ua})
    ON CONFLICT (endpoint) DO UPDATE
      SET p256dh     = EXCLUDED.p256dh,
          auth       = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          updated_at = now()
    RETURNING id
  `;
  return { id: row.id };
}

/** Elimina la suscripción de un endpoint específico del usuario. R5, R6 */
export async function deletePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string
): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE FROM push_subscription
    WHERE endpoint = ${endpoint} AND user_id = ${userId}
  `;
}

/** Elimina cualquier suscripción con ese endpoint (limpieza 404/410). R11 */
export async function deletePushSubscriptionByEndpointAny(endpoint: string): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE FROM push_subscription
    WHERE endpoint = ${endpoint}
  `;
}

/** Devuelve las suscripciones de un conjunto de usuarios. R9 */
export async function listPushSubscriptionsByUserIds(
  userIds: string[]
): Promise<StoredPushSubscription[]> {
  if (userIds.length === 0) {
    return [];
  }
  const sql = getSql();
  const rows = await sql<
    { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[]
  >`
    SELECT id, user_id, endpoint, p256dh, auth
    FROM push_subscription
    WHERE user_id = ANY(${userIds}::uuid[])
  `;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth
  }));
}
