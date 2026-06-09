import { resolveDatabaseUrl } from './database-url.mjs';

let connectionString;
try {
  connectionString = resolveDatabaseUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { createSql } = await import('../build/migrate-deps.js');
const { runMigrations } = await import('../build/migrate.js');

const sql = createSql(connectionString);

try {
  const result = await runMigrations(sql);
  console.log('[migrate] applied:', result.applied.join(', ') || '(none)');
  console.log('[migrate] skipped:', result.skipped.join(', ') || '(none)');
} finally {
  await sql.end();
}
