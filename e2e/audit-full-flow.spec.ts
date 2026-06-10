import { test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { AUDIT_SCENARIOS } from './fixtures/audit-scenarios';
import { runFullAuditFlow } from './helpers/audit-flow';

test.describe.configure({ mode: 'serial' });
test.describe('flujo completo de auditoría', () => {
  test.beforeAll(async () => {
    const sql = createSql(
      process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
    );
    await withDbSuiteLock(sql, async (s) => {
      await runMigrations(s);
      await runSeed(s);
    });
    await sql.end({ timeout: 5 });
  });

  for (const scenario of AUDIT_SCENARIOS) {
    test(`caso ${scenario.id}: ${scenario.title} — crear → briefing → relevamiento → cierre`, async ({
      page
    }) => {
      test.setTimeout(240_000);
      const suffix = `E2E-${scenario.id}-${Date.now()}`;
      await runFullAuditFlow(page, scenario, suffix);
    });
  }
});
