import type postgres from 'postgres';
import { DEV_USERS, seedUsers } from '../../src/lib/server/db/seed/users';
import { runSeed, type SeedOptions } from '../../src/lib/server/db/seed';
import { clearSqlForTests, createSql, setSqlForTests } from '../../src/lib/server/db/client';
import { E2E_DB_LOCK_KEY, withDbSuiteLock } from './db-lock';

/** Mutex en globalThis: sobrevive duplicación de módulos en vitest. */
const TEST_DB_STATE_KEY = '__auditapp_test_db_state__';
type TestDbState = {
  sharedSql?: postgres.Sql;
  serialTail: Promise<void>;
  baselineSeeded: boolean;
  testHoldRelease?: () => void;
  testCaseLockDepth: number;
};

function getState(): TestDbState {
  const g = globalThis as { [TEST_DB_STATE_KEY]?: TestDbState };
  if (!g[TEST_DB_STATE_KEY]) {
    g[TEST_DB_STATE_KEY] = {
      serialTail: Promise.resolve(),
      baselineSeeded: false,
      testCaseLockDepth: 0
    };
  }
  return g[TEST_DB_STATE_KEY]!;
}

function resetDbSerialChain(): void {
  getState().serialTail = Promise.resolve();
}

/** Espera a que termine la cola serial (hold de test o reset en curso). */
export async function flushTestDbSerial(): Promise<void> {
  await getState().serialTail;
}

async function lockTestCase(sql: postgres.Sql): Promise<void> {
  const state = getState();
  if (state.testCaseLockDepth === 0) {
    await sql`SELECT pg_advisory_lock(${E2E_DB_LOCK_KEY})`;
  }
  state.testCaseLockDepth += 1;
}

async function unlockTestCase(sql: postgres.Sql): Promise<void> {
  const state = getState();
  if (state.testCaseLockDepth <= 0) {
    return;
  }
  state.testCaseLockDepth -= 1;
  if (state.testCaseLockDepth === 0) {
    await sql`SELECT pg_advisory_unlock(${E2E_DB_LOCK_KEY})`;
  }
}

/**
 * Toma cola serial + advisory lock hasta releaseTestDbHold.
 * Cubre truncate + cuerpo del test.
 */
export async function acquireTestDbHold(sql: postgres.Sql): Promise<void> {
  const state = getState();
  const previous = state.serialTail;
  let release!: () => void;
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.serialTail = slot;
  await previous;
  await lockTestCase(sql);
  state.testHoldRelease = release;
  setSqlForTests(sql);
}

/** Libera cola serial y advisory lock tomados por acquireTestDbHold. */
export async function releaseTestDbHold(): Promise<void> {
  const state = getState();
  // Primero advisory unlock: el siguiente test no debe truncar hasta liberar el lock.
  if (state.sharedSql) {
    await unlockTestCase(state.sharedSql);
  }
  if (state.testHoldRelease) {
    state.testHoldRelease();
    state.testHoldRelease = undefined;
  }
}

const BASELINE_TEMPLATE_CODES = ['it', 'erp-estandar', 'erp-tango'] as const;

/** Usuarios + plantillas activas mínimas del seed. */
export async function hasBaselineData(sql: postgres.Sql): Promise<boolean> {
  const [users] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM app_user
    WHERE role IN ('admin', 'tecnico') AND active = true
  `;
  if (Number(users.count) < 3) {
    return false;
  }
  for (const code of BASELINE_TEMPLATE_CODES) {
    const [template] = await sql<{ id: string }[]>`
      SELECT id FROM template WHERE code = ${code} AND status = 'active' LIMIT 1
    `;
    if (!template) {
      return false;
    }
  }
  return true;
}

/** Sincroniza baselineSeeded con el estado real de la DB. */
export async function syncBaselineSeedFlagFromDb(sql: postgres.Sql): Promise<boolean> {
  const hasBaseline = await hasBaselineData(sql);
  getState().baselineSeeded = hasBaseline;
  return hasBaseline;
}

/** Serializa truncate/seed entre procesos (advisory lock) y archivos (cola). */
export async function withTestDbSerial<T>(
  sql: postgres.Sql,
  fn: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  const state = getState();
  if (state.testHoldRelease) {
    setSqlForTests(sql);
    return fn(sql);
  }

  await flushTestDbSerial();
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
 * Usar solo dentro de withTestDbSerial / acquireTestDbHold (evita deadlock).
 */
export async function truncateSeedTablesUnsafe(sql: postgres.Sql): Promise<void> {
  setSqlForTests(sql);
  // #23: `client` es ahora una vista sobre `empresa`; se trunca la tabla base `empresa`
  // (CASCADE arrastra audit, crm_lead, empresa_evento). empresa_evento explícito por claridad.
  await sql`
    TRUNCATE TABLE
      audit_bundle_import,
      attachment,
      audit_closure,
      audit_section_score,
      audit_response,
      audit_report_share,
      survey_response,
      audit_report_edit,
      audit_report,
      audit_proposal_link,
      audit,
      email_log,
      empresa_evento,
      crm_lead_event,
      crm_lead,
      template_item,
      section,
      template,
      empresa,
      session,
      app_user
    RESTART IDENTITY CASCADE
  `;
}

/** Trunca tablas de forma serializada. */
export async function truncateSeedTables(sql: postgres.Sql): Promise<void> {
  await withTestDbSerial(sql, truncateSeedTablesUnsafe);
}

/**
 * Trunca solo datos volátiles por test (auditorías, sesiones).
 * Sin mutex; usar dentro de acquireTestDbHold / withTestDbSerial.
 */
export async function resetVolatileTablesUnsafe(sql: postgres.Sql): Promise<void> {
  setSqlForTests(sql);
  await sql`
    TRUNCATE TABLE
      audit_bundle_import,
      attachment,
      audit_closure,
      audit_section_score,
      audit_response,
      audit_report_share,
      survey_response,
      audit_report_edit,
      audit_report,
      audit_proposal_link,
      audit,
      email_log,
      empresa_evento,
      crm_lead_event,
      crm_lead,
      session
    RESTART IDENTITY CASCADE
  `;
}

/** Trunca solo datos volátiles por test (auditorías, sesiones). */
export async function resetVolatileTablesForTests(sql: postgres.Sql): Promise<void> {
  await flushTestDbSerial();
  await withTestDbSerial(sql, resetVolatileTablesUnsafe);
}

/** Trunca tablas de seed y ejecuta runSeed (sin mutex; usar dentro de withTestDbSerial). */
export async function resetDatabaseToBaseline(
  sql: postgres.Sql,
  opts?: SeedOptions
): Promise<void> {
  await truncateSeedTablesUnsafe(sql);
  await runSeed(sql, opts);
  getState().baselineSeeded = true;
}

/** Trunca tablas de seed y ejecuta runSeed de forma serializada. */
export async function resetAndSeedForTests(
  sql: postgres.Sql,
  opts?: SeedOptions & { skipIfBaseline?: boolean }
): Promise<void> {
  await flushTestDbSerial();
  await withTestDbSerial(sql, async (s) => {
    const hasBaseline = await syncBaselineSeedFlagFromDb(s);
    if (opts?.skipIfBaseline && hasBaseline) {
      await resetVolatileTablesUnsafe(s);
      return;
    }
    await resetDatabaseToBaseline(s, opts);
  });
}

/** Baseline seed una vez; entre tests solo trunca auditorías/sesiones. */
export async function ensureBaselineSeed(sql: postgres.Sql): Promise<void> {
  await flushTestDbSerial();
  await withTestDbSerial(sql, async (s) => {
    const hasBaseline = await syncBaselineSeedFlagFromDb(s);
    if (hasBaseline) {
      await resetVolatileTablesUnsafe(s);
      return;
    }
    await resetDatabaseToBaseline(s);
  });
}

export function resetBaselineSeedFlag(): void {
  getState().baselineSeeded = false;
}

/** Trunca y siembra solo usuarios (auth tests). */
export async function resetAuthUsersForTests(sql: postgres.Sql): Promise<void> {
  await flushTestDbSerial();
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
  await releaseTestDbHold();
  clearSqlForTests();
  if (state.sharedSql) {
    await state.sharedSql.end({ timeout: 5 });
    state.sharedSql = undefined;
  }
  resetDbSerialChain();
  resetBaselineSeedFlag();
  state.testCaseLockDepth = 0;
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
