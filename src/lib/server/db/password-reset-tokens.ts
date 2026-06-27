import { getSql } from './client';

export type ResetTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

export async function insertResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<{ id: string }> {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO password_reset_token (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt})
    RETURNING id
  `;
  return row;
}

export async function findResetTokenByHash(tokenHash: string): Promise<ResetTokenRow | null> {
  const sql = getSql();
  const [row] = await sql<ResetTokenRow[]>`
    SELECT id, user_id, token_hash, expires_at, used_at, created_at
    FROM password_reset_token
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  return row ?? null;
}

export async function markResetTokenUsed(id: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE password_reset_token
    SET used_at = now()
    WHERE id = ${id}
  `;
}

/**
 * Invalida todos los tokens no usados del usuario (used_at = now()).
 * Llamar antes de crear un nuevo token para que solo el último sea válido (R6).
 */
export async function invalidateUserResetTokens(userId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE password_reset_token
    SET used_at = now()
    WHERE user_id = ${userId} AND used_at IS NULL
  `;
}
