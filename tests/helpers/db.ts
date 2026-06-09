import type postgres from 'postgres';
import { seedUsers } from '../../src/lib/server/db/seed/users';
import { runSeed, type SeedOptions } from '../../src/lib/server/db/seed';
import { clearSqlForTests, createSql, setSqlForTests } from '../../src/lib/server/db/client';
import { withDbSuiteLock } from './db-lock';

/** Mutex en globalThis: sobrevive duplicación de módulos en vitest. */
const TEST_DB_STATE_KEY = '__auditapp_test_db_state__';
type TestDbState = {
  sharedSql?: postgres.Sql;
  serialTail: Promise<void>;
  baselineSeeded: boolean;
};

function getState(): TestDbState {
  const g = globalThis as { [TEST_DB_STATE_KEY]?: TestDbState };
  if (!g[TEST_DB_STATE_KEY]) {
    g[TEST_DB_STATE_KEY] = { serialTail: Promise.resolve(), baselineSeeded: false };
  }
  return g[TEST_DB_STATE_KEY]!;
}

function resetDbSerialChain(): void {
  getState().serialTail = Promise.resolve();
}

/** Espera a que termine la cola serial (p. ej. beforeAll en seed.test). */
export async function flushTestDbSerial(): Promise<void> {
  await getState().serialTail;
}

/** Serializa truncate/seed entre tests (mutex en globalThis). */
export async function withTestDbSerial<T>(
  sql: postgres.Sql,
  fn: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  const state = getState();
  const previous = state.serialTail;
  let release!: () => void;
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.serialTail = slot;

  await previous;
  setSqlForTests(sql);
  try {
    return await withDbSuiteLock(sql, fn);
  } finally {
    release();
  }
}

/**
 * Trunca tablas sin mutex.
 * Usar solo dentro de withTestDbSerial / resetAndSeedForTests (evita deadlock).
 */
export async function truncateSeedTablesUnsafe(sql: postgres.Sql): Promise<void> {
  setSqlForTests(sql);
  await sql`
    TRUNCATE TABLE
      attachment,
      audit_closure,
      audit_section_score,
      audit_response,
      audit,
      template_item,
      section,
      template,
      client,
      session,
      app_user
    RESTART IDENTITY CASCADE
  `;
}

/** Trunca tablas de forma serializada. */
export async function truncateSeedTables(sql: postgres.Sql): Promise<void> {
  await withTestDbSerial(sql, truncateSeedTablesUnsafe);
}

/** Trunca solo datos volátiles por test (auditorías, sesiones). */
export async function resetVolatileTablesForTests(sql: postgres.Sql): Promise<void> {
  await withTestDbSerial(sql, async (s) => {
    await s`
      TRUNCATE TABLE
        attachment,
        audit_closure,
        audit_section_score,
        audit_response,
        audit,
        session
      RESTART IDENTITY CASCADE
    `;
  });
}

/** Trunca tablas de seed y ejecuta runSeed de forma serializada. */
export async function resetAndSeedForTests(
  sql: postgres.Sql,
  opts?: SeedOptions
): Promise<void> {
  await withTestDbSerial(sql, async (s) => {
    await truncateSeedTablesUnsafe(s);
    await runSeed(s, opts);
    getState().baselineSeeded = true;
  });
}

/** Baseline seed una vez; entre tests solo trunca auditorías/sesiones. */
export async function ensureBaselineSeed(sql: postgres.Sql): Promise<void> {
  if (getState().baselineSeeded) {
    await resetVolatileTablesForTests(sql);
    return;
  }
  await resetAndSeedForTests(sql);
}

export function resetBaselineSeedFlag(): void {
  getState().baselineSeeded = false;
}

/** Trunca y siembra solo usuarios (auth tests). */
export async function resetAuthUsersForTests(sql: postgres.Sql): Promise<void> {
  await withTestDbSerial(sql, async (s) => {
    await truncateSeedTablesUnsafe(s);
    await seedUsers(s);
  });
}

export function getTestSql(): postgres.Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — required for DB integration tests');
  }
  const state = getState();
  if (!state.sharedSql) {
    state.sharedSql = createSql(connectionString);
    setSqlForTests(state.sharedSql);
  }
  return state.sharedSql;
}

export async function setupTestDb(): Promise<postgres.Sql> {
  return getTestSql();
}

/** No-op en afterAll por archivo; el cierre global va en global-teardown. */
export async function teardownTestDb(): Promise<void> {
  // Intencionalmente vacío: reutilizar conexión entre archivos de test.
}

/** Cierra la conexión compartida al final de la suite vitest. */
export async function closeTestDb(): Promise<void> {
  const state = getState();
  await state.serialTail;
  clearSqlForTests();
  if (state.sharedSql) {
    await state.sharedSql.end({ timeout: 5 });
    state.sharedSql = undefined;
  }
  resetDbSerialChain();
  resetBaselineSeedFlag();
}

export async function tableExists(sql: postgres.Sql, tableName: string): Promise<boolean> {
  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS exists
  `;
  return row?.exists ?? false;
}

export async function columnNames(sql: postgres.Sql, tableName: string): Promise<string[]> {
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;
  return rows.map((r) => r.column_name);
}

export async function indexNames(sql: postgres.Sql, tableName: string): Promise<string[]> {
  const rows = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ${tableName}
  `;
  return rows.map((r) => r.indexname);
}
