import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { seedTemplates } from '../src/lib/server/db/seed/templates';
import { seedUsers } from '../src/lib/server/db/seed/users';
import { insertTestAuditRow } from '../tests/helpers/backoffice';

const TOKEN = 'e2e-briefing-token-demo';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

const sql = createSql(process.env.DATABASE_URL);
await runMigrations(sql);
await seedUsers(sql);
await seedTemplates(sql);

const existing = await sql<{ id: string }[]>`
  SELECT id FROM audit WHERE public_token = ${TOKEN} AND archived_at IS NULL LIMIT 1
`;

if (existing.length === 0) {
  await insertTestAuditRow(sql, {
    razonSocial: 'E2E Cliente Demo',
    status: 'briefing_enviado',
    publicToken: TOKEN
  });
}

await sql.end();
