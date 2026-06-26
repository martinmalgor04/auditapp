import { getSql } from './client';
import type { AuditType } from '$lib/audit-types';
import type { AppUser } from '../auth/types';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'tecnico';
  active: boolean;
  audit_types: AuditType[] | null;
};

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    auditTypes: row.audit_types
  };
}

export async function findUserByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const sql = getSql();
  const [row] = await sql<
    (UserRow & { password_hash: string })[]
  >`
    SELECT id, email, name, role, active, audit_types, password_hash
    FROM app_user
    WHERE email = ${email}
    LIMIT 1
  `;

  if (!row) {
    return null;
  }

  return {
    ...toAppUser(row),
    passwordHash: row.password_hash
  };
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const sql = getSql();
  const [row] = await sql<UserRow[]>`
    SELECT id, email, name, role, active, audit_types
    FROM app_user
    WHERE id = ${id}
    LIMIT 1
  `;

  return row ? toAppUser(row) : null;
}

/**
 * Busca un usuario por email excluyendo un id (chequeo de colisión de email, R5).
 * Devuelve el id del otro usuario que ya usa ese email, o null si está libre.
 */
export async function findUserByEmailExcept(
  email: string,
  excludeId: string
): Promise<{ id: string } | null> {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    SELECT id
    FROM app_user
    WHERE email = ${email} AND id <> ${excludeId}
    LIMIT 1
  `;
  return row ?? null;
}

/**
 * Actualiza nombre visible y email del usuario (R4). El email choca con la UNIQUE de
 * `app_user.email`: Postgres `23505` se mapea a `{ ok:false, reason:'email_in_use' }` (R5).
 */
export async function updateUserProfile(
  id: string,
  data: { name: string; email: string }
): Promise<{ ok: true } | { ok: false; reason: 'email_in_use' }> {
  const sql = getSql();
  try {
    await sql`
      UPDATE app_user
      SET name = ${data.name}, email = ${data.email}
      WHERE id = ${id}
    `;
    return { ok: true };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return { ok: false, reason: 'email_in_use' };
    }
    throw err;
  }
}

/** Reescribe el hash argon2id del usuario (R10). */
export async function updateUserPasswordHash(id: string, passwordHash: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE app_user
    SET password_hash = ${passwordHash}
    WHERE id = ${id}
  `;
}
