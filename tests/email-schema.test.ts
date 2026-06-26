import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setSqlForTests } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import {
  columnNames,
  indexNames,
  setupTestDb,
  tableExists,
  teardownTestDb
} from './helpers/db';

describe('email schema (#49 R6, R12)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('crea email_log con columnas y CHECK de estado', async () => {
    expect(await tableExists(sql, 'email_log')).toBe(true);

    const cols = await columnNames(sql, 'email_log');
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'to_email',
        'template',
        'status',
        'error',
        'created_at',
        'sent_at'
      ])
    );

    const idx = await indexNames(sql, 'email_log');
    expect(idx).toContain('email_log_template_idx');
    expect(idx).toContain('email_log_created_idx');

    await expect(
      sql`INSERT INTO email_log (to_email, template, status) VALUES ('a@b.com', 'test', 'invalido')`
    ).rejects.toThrow();
  });

  it('agrega notify_internal_email a app_user con default true', async () => {
    const cols = await columnNames(sql, 'app_user');
    expect(cols).toContain('notify_internal_email');

    const [row] = await sql<{ notify_internal_email: boolean }[]>`
      SELECT notify_internal_email
      FROM app_user
      WHERE email = 'admin@serviciosysistemas.com.ar'
      LIMIT 1
    `;
    expect(row.notify_internal_email).toBe(true);
  });

  it('migración 026 es idempotente: runMigrations dos veces no falla', async () => {
    const migrationSql = readFileSync(
      resolve(process.cwd(), 'migrations/026_servicio_email.sql'),
      'utf8'
    );
    await sql.unsafe(migrationSql);
    await sql.unsafe(migrationSql);

    const first = await runMigrations(sql);
    expect(first.skipped).toContain('026_servicio_email');
    const second = await runMigrations(sql);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain('026_servicio_email');
  });
});
