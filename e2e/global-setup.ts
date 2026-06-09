/**
 * Playwright globalSetup: migraciones + seed idempotente (sin TRUNCATE).
 * El fixture e2e se asegura de nuevo en ensure-audit.ts justo antes del preview.
 */
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
  }

  const sql = createSql(process.env.DATABASE_URL);
  await runMigrations(sql);
  await runSeed(sql);
  await sql.end({ timeout: 5 });
}
