import type postgres from 'postgres';
import { seedUsers } from '../../src/lib/server/db/seed/users';
import type { AuditStatus } from '../../src/lib/server/db/audit-status';
import type { AppUser } from '../../src/lib/server/auth/types';

export async function findUserByEmail(sql: postgres.Sql, email: string): Promise<AppUser | null> {
  const [row] = await sql<
    {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'tecnico';
      active: boolean;
      audit_types: AppUser['auditTypes'];
    }[]
  >`
    SELECT id, email, name, role, active, audit_types FROM app_user WHERE email = ${email} LIMIT 1
  `;
  return row
    ? {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        active: row.active,
        auditTypes: row.audit_types
      }
    : null;
}

export async function seedAuthUsers(sql: postgres.Sql): Promise<void> {
  await seedUsers(sql);
}

export async function findUserIdByEmail(sql: postgres.Sql, email: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM app_user WHERE email = ${email} LIMIT 1
  `;
  if (!row) {
    throw new Error(`User not found: ${email}`);
  }
  return row.id;
}

export async function insertTestAudit(
  sql: postgres.Sql,
  opts: { status: AuditStatus; publicToken: string }
): Promise<{ auditId: string; clientId: string }> {
  const [client] = await sql<{ id: string }[]>`
    INSERT INTO client (razon_social)
    VALUES ('Cliente Test Auth')
    RETURNING id
  `;

  const [audit] = await sql<{ id: string }[]>`
    INSERT INTO audit (
      client_id, name, types, template_ids, segment, status, public_token
    )
    VALUES (
      ${client.id},
      'Auditoría test',
      ARRAY['it']::text[],
      ARRAY[]::uuid[],
      'A',
      ${opts.status},
      ${opts.publicToken}
    )
    RETURNING id
  `;

  return { auditId: audit.id, clientId: client.id };
}
