import type postgres from 'postgres';
import { seedUsers } from '../../src/lib/server/db/seed/users';
import type { AuditStatus } from '../../src/lib/server/db/audit-status';

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
