import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { seedAuditFormFixture } from '../tests/fixtures/audit-form';

function connectionString(): string {
  return process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

async function resetVolatileForE2e(sql: postgres.Sql): Promise<void> {
  await sql`
    TRUNCATE TABLE
      attachment,
      audit_closure,
      audit_section_score,
      audit_response,
      audit,
      session
    RESTART IDENTITY CASCADE
  `;
}

/** Garantiza auditoría en en_relevamiento para E2E form. Retorna auditId. */
export async function ensureE2eFormAudit(existingSql?: postgres.Sql): Promise<string> {
  const owned = !existingSql;
  const sql = existingSql ?? createSql(connectionString());
  let auditId = '';

  await withDbSuiteLock(sql, async (s) => {
    await runMigrations(s);
    await runSeed(s);
    await resetVolatileForE2e(s);
    const seeded = await seedAuditFormFixture(s, {
      razonSocial: 'E2E Form Técnico Demo',
      status: 'briefing_completo',
      publicToken: 'e2e-form-token-demo'
    });
    auditId = seeded.auditId;
    await s`UPDATE audit SET status = 'en_relevamiento' WHERE id = ${auditId}`;
  });

  if (owned) {
    await sql.end({ timeout: 5 });
  }

  return auditId;
}

/** Alias para compatibilidad retroactiva con specs que importan `ensureFormAudit`. */
export { ensureE2eFormAudit as ensureFormAudit };

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const id = await ensureE2eFormAudit();
  console.log('E2E_FORM_AUDIT_ID=', id);
}
