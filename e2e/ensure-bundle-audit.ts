import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';
import { createSql, setSqlForTests } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { seedBundleAuditFixture } from '../tests/fixtures/audit-bundle';

export const E2E_BUNDLE_RAZON_SOCIAL = 'E2E Bundle Origen SA';
export const E2E_BUNDLE_CUIT = '30-44455566-7';

function connectionString(): string {
  return process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

/** Crea una auditoría rica de origen para el flujo export→import del backoffice. */
export async function ensureE2eBundleAudit(existingSql?: postgres.Sql): Promise<string> {
  const owned = !existingSql;
  const sql = existingSql ?? createSql(connectionString());
  let auditId = '';

  await withDbSuiteLock(sql, async (s) => {
    await runMigrations(s);
    await runSeed(s);
    setSqlForTests(s);
    const fx = await seedBundleAuditFixture(s, {
      status: 'en_relevamiento',
      razonSocial: E2E_BUNDLE_RAZON_SOCIAL,
      cuit: E2E_BUNDLE_CUIT
    });
    auditId = fx.auditId;
  });

  if (owned) {
    await sql.end({ timeout: 5 });
  }
  return auditId;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await ensureE2eBundleAudit();
}
