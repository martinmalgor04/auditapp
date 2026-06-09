import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { insertTestAuditRow } from '../tests/helpers/backoffice';

export const E2E_BRIEFING_TOKEN = 'e2e-briefing-token-demo';

function connectionString(): string {
  return process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

/** Trunca solo datos volátiles; conserva users/templates (seed idempotente). */
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

/**
 * Garantiza fila briefing E2E legible por preview.
 * Llamar desde Playwright beforeAll con el webServer ya arriba.
 */
export async function ensureE2eBriefingAudit(existingSql?: postgres.Sql): Promise<void> {
  const owned = !existingSql;
  const sql = existingSql ?? createSql(connectionString());

  await withDbSuiteLock(sql, async (s) => {
    await runMigrations(s);
    await runSeed(s);
    await resetVolatileForE2e(s);
    await insertTestAuditRow(s, {
      razonSocial: 'E2E Cliente Demo',
      status: 'briefing_enviado',
      publicToken: E2E_BRIEFING_TOKEN
    });

    const [row] = await s<{ public_token: string; status: string }[]>`
      SELECT public_token, status
      FROM audit
      WHERE public_token = ${E2E_BRIEFING_TOKEN}
        AND archived_at IS NULL
      LIMIT 1
    `;
    if (!row || row.status !== 'briefing_enviado') {
      throw new Error(`E2E audit missing after seed (token=${E2E_BRIEFING_TOKEN})`);
    }
  });

  if (owned) {
    await sql.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await ensureE2eBriefingAudit();
}
