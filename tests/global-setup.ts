import { createSql } from '../src/lib/server/db/client';
import { resetDatabase, runMigrations } from '../src/lib/server/db/migrate';

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
  }

  const sql = createSql(process.env.DATABASE_URL);
  await resetDatabase(sql);
  await runMigrations(sql);
  await sql.end();
}
