const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
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
