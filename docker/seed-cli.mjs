import { resolveDatabaseUrl } from './database-url.mjs';

let connectionString;
try {
  connectionString = resolveDatabaseUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { createSql } = await import('../build/migrate-deps.js');
const { runInitialSeedIfNeeded } = await import('../build/seed.js');

const sql = createSql(connectionString);

try {
  const result = await runInitialSeedIfNeeded(sql);
  if (result.reason === 'seeded') {
    console.log('[seed] initial seed completed');
  } else if (result.reason === 'already_initialized') {
    console.log('[seed] skipped — database already initialized');
  } else {
    console.log('[seed] skipped — AUTO_SEED disabled');
  }
} finally {
  await sql.end();
}
