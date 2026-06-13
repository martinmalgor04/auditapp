import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { closeTestDb, resetDatabaseToBaseline } from './helpers/db';
import { withDbSuiteLock } from './helpers/db-lock';

async function waitForPostgres(connectionString: string, attempts = 30): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const sql = createSql(connectionString);
    try {
      await runMigrations(sql);
      await withDbSuiteLock(sql, (s) => resetDatabaseToBaseline(s));
      await sql.end({ timeout: 5 });
      return;
    } catch (error) {
      lastError = error;
      await sql.end({ timeout: 5 }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

/** Migraciones al inicio; teardown cierra la conexión compartida del worker. */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
  }

  await waitForPostgres(process.env.DATABASE_URL);

  return async () => {
    await closeTestDb();
  };
}
