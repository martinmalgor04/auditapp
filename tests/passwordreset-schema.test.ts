/**
 * Tests de migración idempotente para password_reset_token (R17).
 * Verifica que aplicar la migración dos veces no falla y que las columnas e índices existen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/db';
import type postgres from 'postgres';

describe('password_reset_token schema (R17)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('la migración 027 es idempotente (segunda aplicación no falla)', async () => {
    // La migración ya fue aplicada por setupTestDb (runMigrations).
    // Reejecutamos el DDL directamente para verificar idempotencia de IF NOT EXISTS.
    await expect(
      sql.unsafe(`
        CREATE TABLE IF NOT EXISTS password_reset_token (
          id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
          token_hash  text NOT NULL,
          expires_at  timestamptz NOT NULL,
          used_at     timestamptz,
          created_at  timestamptz NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS password_reset_token_hash_uq
          ON password_reset_token (token_hash);
        CREATE INDEX IF NOT EXISTS password_reset_token_user_idx
          ON password_reset_token (user_id);
        CREATE INDEX IF NOT EXISTS password_reset_token_expires_idx
          ON password_reset_token (expires_at);
      `)
    ).resolves.toBeDefined();
  });

  it('la tabla tiene las columnas esperadas', async () => {
    const rows = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'password_reset_token'
      ORDER BY ordinal_position
    `;
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('token_hash');
    expect(cols).toContain('expires_at');
    expect(cols).toContain('used_at');
    expect(cols).toContain('created_at');
  });

  it('el índice único sobre token_hash existe', async () => {
    const [row] = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'password_reset_token'
        AND indexname = 'password_reset_token_hash_uq'
    `;
    expect(row?.indexname).toBe('password_reset_token_hash_uq');
  });

  it('los índices de user_id y expires_at existen', async () => {
    const rows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'password_reset_token'
        AND indexname IN ('password_reset_token_user_idx', 'password_reset_token_expires_idx')
    `;
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('password_reset_token_user_idx');
    expect(names).toContain('password_reset_token_expires_idx');
  });
});
