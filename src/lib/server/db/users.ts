import { getSql } from './client';
import type { AppUser } from '../auth/types';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'tecnico';
  active: boolean;
};

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active
  };
}

export async function findUserByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const sql = getSql();
  const [row] = await sql<
    (UserRow & { password_hash: string })[]
  >`
    SELECT id, email, name, role, active, password_hash
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
    SELECT id, email, name, role, active
    FROM app_user
    WHERE id = ${id}
    LIMIT 1
  `;

  return row ? toAppUser(row) : null;
}
