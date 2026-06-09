import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';

/** Solo migraciones; el fixture E2E corre en briefing.spec beforeAll. */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
  }

  const sql = createSql(process.env.DATABASE_URL);
  await runMigrations(sql);
  await sql.end({ timeout: 5 });
}
