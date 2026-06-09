import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { insertTestAuditRow } from '../tests/helpers/backoffice';

const TOKEN = 'e2e-briefing-token-demo';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

const sql = createSql(process.env.DATABASE_URL);
await runMigrations(sql);

await sql`
  TRUNCATE TABLE
    attachment,
    audit_closure,
    audit_section_score,
    audit_response,
    audit,
    template_item,
    section,
    template,
    client,
    session,
    app_user
  RESTART IDENTITY CASCADE
`;

await runSeed(sql);

await insertTestAuditRow(sql, {
  razonSocial: 'E2E Cliente Demo',
  status: 'briefing_enviado',
  publicToken: TOKEN
});

await sql.end({ timeout: 5 });
