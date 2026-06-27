/**
 * Tests de schema para #53 notificaciones push.
 * Cubre: R3 (migración idempotente, columnas, UNIQUE endpoint, notify_push).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setSqlForTests } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { columnNames, indexNames, setupTestDb, tableExists, teardownTestDb } from './helpers/db';

describe('push schema (#53 R3)', () => {
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

  it('crea push_subscription con las columnas requeridas', async () => {
    expect(await tableExists(sql, 'push_subscription')).toBe(true);

    const cols = await columnNames(sql, 'push_subscription');
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'endpoint',
        'p256dh',
        'auth',
        'user_agent',
        'created_at',
        'updated_at'
      ])
    );
  });

  it('push_subscription tiene UNIQUE index en endpoint', async () => {
    const idx = await indexNames(sql, 'push_subscription');
    expect(idx).toContain('push_subscription_endpoint_uidx');
    expect(idx).toContain('push_subscription_user_idx');
  });

  it('UNIQUE constraint en endpoint: insertar duplicado falla', async () => {
    // Obtener un user_id válido de la DB de test
    const [adminUser] = await sql<{ id: string }[]>`
      SELECT id FROM app_user WHERE role = 'admin' LIMIT 1
    `;
    const userId = adminUser.id;

    await sql`DELETE FROM push_subscription WHERE endpoint = 'https://unique-test.example.com/push/1'`;
    await sql`
      INSERT INTO push_subscription (user_id, endpoint, p256dh, auth)
      VALUES (${userId}, 'https://unique-test.example.com/push/1', 'pk1', 'auth1')
    `;

    await expect(
      sql`
        INSERT INTO push_subscription (user_id, endpoint, p256dh, auth)
        VALUES (${userId}, 'https://unique-test.example.com/push/1', 'pk2', 'auth2')
      `
    ).rejects.toThrow();

    await sql`DELETE FROM push_subscription WHERE endpoint = 'https://unique-test.example.com/push/1'`;
  });

  it('app_user.notify_push existe con default true', async () => {
    const cols = await columnNames(sql, 'app_user');
    expect(cols).toContain('notify_push');

    const [row] = await sql<{ notify_push: boolean }[]>`
      SELECT notify_push FROM app_user
      WHERE email = 'admin@serviciosysistemas.com.ar'
      LIMIT 1
    `;
    expect(row.notify_push).toBe(true);
  });

  it('migración 028 es idempotente: ejecutar dos veces no falla', async () => {
    const migrationSql = readFileSync(
      resolve(process.cwd(), 'migrations/028_notificaciones_push.sql'),
      'utf8'
    );
    // Ejecutar dos veces no debe lanzar
    await sql.unsafe(migrationSql);
    await sql.unsafe(migrationSql);

    const result = await runMigrations(sql);
    expect(result.skipped).toContain('028_notificaciones_push');
  });
});
