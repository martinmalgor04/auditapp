#!/usr/bin/env tsx
import { createSql } from '../src/lib/server/db/client';
import { runSeed } from '../src/lib/server/db/seed';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = createSql(connectionString);

try {
  await runSeed(sql, { users: false, clients: false, templates: true });
  console.log('Templates seed completed');
} finally {
  await sql.end();
}
