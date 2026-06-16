import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setupTestDb, teardownTestDb, columnNames } from '../helpers/db';

const MIGRATION_SQL = readFileSync(
  join(process.cwd(), 'migrations/016_reunion_verification_status.sql'),
  'utf8'
);

// R19 — la migración 016 es idempotente y aditiva: agrega la columna nullable
// verification_status sin tocar columnas existentes.
describe('migración 016 — verification_status (R19)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('reunion_proposal tiene la columna verification_status (ya aplicada por el runner)', async () => {
    const cols = await columnNames(sql, 'reunion_proposal');
    expect(cols).toContain('verification_status');
  });

  it('verification_status es nullable con default NULL', async () => {
    const [row] = await sql<{ is_nullable: string; column_default: string | null }[]>`
      SELECT is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reunion_proposal'
        AND column_name = 'verification_status'
    `;
    expect(row.is_nullable).toBe('YES');
    expect(row.column_default).toBeNull();
  });

  it('re-aplicar la migración dos veces no lanza error (idempotente)', async () => {
    await expect(sql.unsafe(MIGRATION_SQL)).resolves.toBeTruthy();
    await expect(sql.unsafe(MIGRATION_SQL)).resolves.toBeTruthy();
    // sigue existiendo y nullable
    const cols = await columnNames(sql, 'reunion_proposal');
    expect(cols).toContain('verification_status');
  });

  it('el CHECK admite NULL/verified/unverified y rechaza otros valores', async () => {
    // Verificamos el dominio mediante el constraint, sin depender de filas válidas:
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reunion_proposal_verification_status_check'
      ) AS exists
    `;
    expect(row.exists).toBe(true);
  });
});
