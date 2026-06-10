import { resolveDatabaseUrl } from './database-url.mjs';

let connectionString;
try {
  connectionString = resolveDatabaseUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { createSql } = await import('../build/migrate-deps.js');
const { runSeed } = await import('../build/seed.js');

const sql = createSql(connectionString);

try {
  await runSeed(sql, { users: false, clients: false, templates: true });
  console.log('[seed] templates sync completed');
} finally {
  await sql.end();
}
