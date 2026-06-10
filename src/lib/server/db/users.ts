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
