const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
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
