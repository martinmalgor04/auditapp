export { createSql, getSql, resetSqlForTests } from './client';

/** Ping opcional para health checks futuros; en stub no ejecuta query real. */
export async function pingDb(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  return true;
}
