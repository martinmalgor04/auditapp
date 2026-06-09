#!/usr/bin/env tsx
import { createSql } from '../src/lib/server/db/client';
import { resetDatabase, runMigrations } from '../src/lib/server/db/migrate';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('db:reset is not allowed in production');
  process.exit(1);
}

const sql = createSql(connectionString);

try {
  await resetDatabase(sql);
  const result = await runMigrations(sql);
  console.log('Database reset; migrations applied:', result.applied);
} finally {
  await sql.end();
}
