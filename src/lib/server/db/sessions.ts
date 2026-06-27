import { getSql } from './client';

export type SessionRow = {
  id: string;
  user_id: string;
  expires_at: Date;
};

export async function insertSession(
  id: string,
  userId: string,
  expiresAt: Date
): Promise<void> {
  const sql = getSql();
  const [pid] = await sql`SELECT pg_backend_pid() AS pid`;
  console.log('DBG insertSession pid=', (pid as any).pid, 'id=', id, 'user=', userId);
  await sql`
    INSERT INTO session (id, user_id, expires_at)
    VALUES (${id}, ${userId}, ${expiresAt})
  `;
}

export async function findSessionById(id: string): Promise<SessionRow | null> {
  const sql = getSql();
  const [row] = await sql<SessionRow[]>`
    SELECT id, user_id, expires_at
    FROM session
    WHERE id = ${id}
    LIMIT 1
  `;
  return row ?? null;
}

export async function deleteSession(id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM session WHERE id = ${id}`;
}

export async function touchSessionExpiry(id: string, expiresAt: Date): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE session
    SET expires_at = ${expiresAt}
    WHERE id = ${id}
  `;
}

/**
 * Borra TODAS las sesiones del usuario (R14 #50): al resetear la contraseña por email
 * no hay sesión «actual» de confianza, se invalidan todas.
 */
export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM session WHERE user_id = ${userId}`;
}

/**
 * Borra todas las sesiones del usuario excepto la indicada (R11): tras cambiar la
 * contraseña, las demás sesiones quedan invalidadas y la actual sigue vigente.
 */
export async function deleteOtherSessions(
  userId: string,
  keepSessionId: string
): Promise<void> {
  const sql = getSql();
  const [pid] = await sql`SELECT pg_backend_pid() AS pid`;
  const all = await sql`SELECT id FROM session WHERE user_id = ${userId}`;
  console.log('DBG deleteOtherSessions pid=', (pid as any).pid, 'userId=', userId, 'rows=', all.map((r:any)=>r.id));
  await sql`
    DELETE FROM session
    WHERE user_id = ${userId} AND id <> ${keepSessionId}
  `;
}
