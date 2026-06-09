#!/usr/bin/env tsx
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = createSql(connectionString);

try {
  const result = await runMigrations(sql);
  console.log('Migrations applied:', result.applied);
  console.log('Migrations skipped:', result.skipped);
} finally {
  await sql.end();
}
