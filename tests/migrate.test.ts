import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/lib/server/db/migrate';
import { setupTestDb, teardownTestDb } from './helpers/db';
import type postgres from 'postgres';

describe('migration runner', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('applies migrations in order', async () => {
    const rows = await sql<{ version: string }[]>`
      SELECT version FROM schema_migration ORDER BY version
    `;
    expect(rows.map((r) => r.version)).toEqual(['001_schema', '002_backoffice']);
  });

  it('skips already applied migrations', async () => {
    const first = await runMigrations(sql);
    expect(first.applied).toEqual([]);
    expect(first.skipped).toContain('001_schema');
    expect(first.skipped).toContain('002_backoffice');

    const second = await runMigrations(sql);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain('001_schema');
    expect(second.skipped).toContain('002_backoffice');
  });
});
