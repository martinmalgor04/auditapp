import { z } from 'zod';
import { hashPassword, verifyPassword } from './password';
import { deleteOtherSessions } from '../db/sessions';
import {
  findUserByEmail,
  findUserByEmailExcept,
  updateUserPasswordHash,
  updateUserProfile
} from '../db/users';
import type { AppUser } from './types';

/** Edición de datos propios (R3: sin `role`; R4: name/email validados, `.strict`). */
export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Ingresá tu nombre').max(120, 'El nombre es demasiado largo'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Email inválido')
      .max(200, 'El email es demasiado largo')
  })
  .strict();
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** Política de fortaleza (R7): mín 10, máx 200, al menos una letra y un dígito. */
const strongPassword = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200, 'La contraseña es demasiado larga')
  .refine((v) => /[A-Za-z]/.test(v), 'Debe incluir al menos una letra')
  .refine((v) => /[0-9]/.test(v), 'Debe incluir al menos un número');

/** Cambio de contraseña (R7 fortaleza, R8 confirmación coincide, `.strict`). */
export const passwordChangeSchema = z
  .object({
    actual: z.string().min(1, 'Ingresá tu contraseña actual'),
    nueva: strongPassword,
    confirmacion: z.string().min(1, 'Repetí la nueva contraseña')
  })
  .strict()
  .refine((d) => d.nueva === d.confirmacion, {
    path: ['confirmacion'],
    message: 'La confirmación no coincide'
  });
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

export type ProfileResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; errors: Record<string, string> }
  | { ok: false; reason: 'email_in_use' };

export type PasswordResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; errors: Record<string, string> }
  | { ok: false; reason: 'wrong_current' }
  | { ok: false; reason: 'same_as_current' };

/** Aplana los issues de Zod a `{ campo: mensaje }` (primer error por campo). */
function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0]?.toString() ?? '_';
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

/**
 * Edita los datos propios del usuario (R4) con unicidad de email (R5).
 * El sujeto siempre es `user` (de `locals.user`); nunca se lee un id del payload (R12).
 */
export async function updateProfile(input: {
  user: AppUser;
  raw: unknown;
}): Promise<ProfileResult> {
  const parsed = profileUpdateSchema.safeParse(input.raw);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', errors: flattenZodErrors(parsed.error) };
  }

  const { name, email } = parsed.data;

  // Chequeo previo de colisión: si OTRO usuario ya tiene ese email → email_in_use (R5).
  if (email !== input.user.email) {
    const collision = await findUserByEmailExcept(email, input.user.id);
    if (collision) {
      return { ok: false, reason: 'email_in_use' };
    }
  }

  const result = await updateUserProfile(input.user.id, { name, email });
  if (!result.ok) {
    // Carrera: UNIQUE de Postgres (23505) capturada por updateUserProfile.
    return { ok: false, reason: 'email_in_use' };
  }
  return { ok: true };
}

/**
 * Cambia la contraseña del usuario autenticado (R6–R11).
 * Verifica la actual (argon2id), exige nueva ≠ actual, re-hashea e invalida las
 * demás sesiones salvo `currentSessionId`. El sujeto es siempre `user` (R12).
 */
export async function changePassword(input: {
  user: AppUser;
  currentSessionId: string;
  raw: unknown;
}): Promise<PasswordResult> {
  const parsed = passwordChangeSchema.safeParse(input.raw);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', errors: flattenZodErrors(parsed.error) };
  }

  const { actual, nueva } = parsed.data;

  // Identidad derivada de locals.user (R12): leemos el hash por email propio.
  const record = await findUserByEmail(input.user.email);
  if (!record) {
    return { ok: false, reason: 'wrong_current' };
  }

  const currentOk = await verifyPassword(actual, record.passwordHash);
  if (!currentOk) {
    return { ok: false, reason: 'wrong_current' }; // R6
  }

  if (nueva === actual) {
    return { ok: false, reason: 'same_as_current' }; // R9
  }

  const newHash = await hashPassword(nueva); // R10
  await updateUserPasswordHash(input.user.id, newHash); // R10
  await deleteOtherSessions(input.user.id, input.currentSessionId); // R11

  return { ok: true };
}
