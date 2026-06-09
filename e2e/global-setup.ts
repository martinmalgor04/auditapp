import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { insertTestAuditRow } from '../tests/helpers/backoffice';

const TOKEN = 'e2e-briefing-token-demo';

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
  }
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-min-32-characters-long!!';
  }
  if (!process.env.PUBLIC_APP_URL) {
    process.env.PUBLIC_APP_URL = 'http://localhost:4173';
  }

  const sql = createSql(process.env.DATABASE_URL);
  await runMigrations(sql);
  await runSeed(sql);

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
}
