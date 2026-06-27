import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { strongPassword } from './password-policy';
import { hashPassword } from './password';
import { findUserByEmail } from '../db/users';
import {
  insertResetToken,
  findResetTokenByHash,
  markResetTokenUsed,
  invalidateUserResetTokens
} from '../db/password-reset-tokens';
import { sendEmail } from '../email';
import { getSql } from '../db/client';
import { logger } from '../logger';

/** Expiración del token en minutos (decisión de puerta R4). */
export const PASSWORD_RESET_TTL_MIN = 60;

export const forgotSchema = z.object({ email: z.string().email() }).strict();

export const resetPasswordSchema = z
  .object({
    nueva: strongPassword,
    confirmacion: z.string()
  })
  .strict()
  .refine((d) => d.nueva === d.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion']
  });

/** SHA-256 hex del token en claro. El claro nunca se almacena. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Solicita un reseteo de contraseña para el email dado.
 * No-op silencioso si el usuario no existe o está inactivo (R5).
 * Nunca revela si el email existe (R2).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);

  // R5: usuario inexistente o inactivo → no-op, sin token ni email
  if (!user || !user.active) {
    return;
  }

  // R6: invalidar tokens previos del usuario
  await invalidateUserResetTokens(user.id);

  // R4: generar token aleatorio, persistir solo su hash
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MIN * 60 * 1000);

  await insertResetToken(user.id, tokenHash, expiresAt);

  // R7: enviar email branded con link en claro
  const appUrl = process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:5173';
  const resetUrl = `${appUrl}/reset/${token}`;

  // No lanza: el error queda en email_log (R7, contrato #49)
  try {
    await sendEmail('password_reset', email, {
      nombre: user.name,
      resetUrl,
      expiraEnMin: PASSWORD_RESET_TTL_MIN
    });
  } catch (err) {
    logger.error('password_reset_email_failed', { email }, err);
  }
}

export type ResetTokenResolution =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' };

/**
 * Resuelve un token en claro: verifica que exista, no esté usado y no esté expirado.
 */
export async function resolveResetToken(token: string): Promise<ResetTokenResolution> {
  const tokenHash = hashToken(token);
  const row = await findResetTokenByHash(tokenHash);

  if (!row) {
    return { ok: false, reason: 'not_found' };
  }
  if (row.used_at !== null) {
    return { ok: false, reason: 'used' };
  }
  if (row.expires_at <= new Date()) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, userId: row.user_id, tokenId: row.id };
}

export type ResetResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_token' };

/**
 * Completa el reseteo de contraseña: hashea la nueva contraseña, consume el token
 * e invalida todas las sesiones del usuario, en una sola transacción (R15).
 *
 * La validación de fortaleza y confirmación se hace antes de llamar esta función
 * (en la form action con `resetPasswordSchema`).
 */
export async function completePasswordReset(
  token: string,
  nueva: string
): Promise<ResetResult> {
  const resolution = await resolveResetToken(token);
  if (!resolution.ok) {
    return { ok: false, reason: 'invalid_token' };
  }

  const { userId, tokenId } = resolution;
  const newHash = await hashPassword(nueva);

  const sql = getSql();

  // R15: transacción atómica
  await sql.begin(async (tx) => {
    // R12: actualizar password_hash
    await tx`UPDATE app_user SET password_hash = ${newHash} WHERE id = ${userId}`;
    // R13: consumir el token
    await tx`UPDATE password_reset_token SET used_at = now() WHERE id = ${tokenId}`;
    // R14: invalidar todas las sesiones del usuario
    await tx`DELETE FROM session WHERE user_id = ${userId}`;
  });

  return { ok: true };
}
