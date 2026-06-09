import type postgres from 'postgres';

/** Mutex Postgres entre vitest y Playwright (procesos distintos). */
export const E2E_DB_LOCK_KEY = 72845001;

export async function withDbSuiteLock<T>(
  sql: postgres.Sql,
  fn: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  await sql`SELECT pg_advisory_lock(${E2E_DB_LOCK_KEY})`;
  try {
    return await fn(sql);
  } finally {
    await sql`SELECT pg_advisory_unlock(${E2E_DB_LOCK_KEY})`;
  }
}
