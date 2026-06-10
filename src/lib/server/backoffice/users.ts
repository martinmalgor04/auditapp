import { getSql } from '$lib/server/db/client';
import { hashPassword } from '$lib/server/auth/password';
import type { AuditType } from '$lib/audit-types';
import { ValidationError } from './errors';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput
} from './schemas';

export type AppUserRow = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'tecnico';
  active: boolean;
  auditTypes: AuditType[] | null;
  createdAt: Date;
};

function normalizeAuditTypesForRole(
  role: 'admin' | 'tecnico',
  auditTypes: AuditType[] | undefined
): AuditType[] | null {
  if (role === 'admin') {
    return null;
  }
  if (!auditTypes || auditTypes.length === 0) {
    return null;
  }
  return auditTypes;
}

export async function listUsers(): Promise<AppUserRow[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'tecnico';
      active: boolean;
      audit_types: AuditType[] | null;
      created_at: Date;
    }[]
  >`
    SELECT id, email, name, role, active, audit_types, created_at
    FROM app_user
    ORDER BY name ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    active: r.active,
    auditTypes: r.audit_types,
    createdAt: r.created_at
  }));
}

export async function createUser(input: CreateUserInput): Promise<{ id: string }> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const data = parsed.data;
  const passwordHash = await hashPassword(data.temporaryPassword);
  const auditTypes = normalizeAuditTypesForRole(data.role, data.auditTypes);
  const sql = getSql();

  try {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO app_user (email, name, password_hash, role, active, audit_types)
      VALUES (${data.email}, ${data.name}, ${passwordHash}, ${data.role}, true, ${auditTypes})
      RETURNING id
    `;
    return { id: row.id };
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
      throw new ValidationError('Ya existe un usuario con ese email');
    }
    throw e;
  }
}

export async function updateUser(input: UpdateUserInput): Promise<void> {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const data = parsed.data;
  const auditTypes = normalizeAuditTypesForRole(data.role, data.auditTypes);
  const sql = getSql();

  await sql`
    UPDATE app_user
    SET email = ${data.email},
        name = ${data.name},
        role = ${data.role},
        active = ${data.active},
        audit_types = ${auditTypes}
    WHERE id = ${data.userId}
  `;
}

export async function resetUserPassword(input: ResetPasswordInput): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const passwordHash = await hashPassword(parsed.data.temporaryPassword);
  const sql = getSql();

  await sql`
    UPDATE app_user
    SET password_hash = ${passwordHash}
    WHERE id = ${parsed.data.userId}
  `;
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE app_user SET active = ${active} WHERE id = ${userId}
  `;
}

export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
