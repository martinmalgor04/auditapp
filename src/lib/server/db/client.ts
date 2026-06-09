import postgres from 'postgres';

/** Crea cliente postgres.js; no conecta hasta la primera query. */
export function createSql(connectionString: string): postgres.Sql {
  return postgres(connectionString, { max: 1 });
}

const TEST_SQL_BRIDGE_KEY = '__auditapp_test_sql_bridge__';

type GlobalWithBridge = typeof globalThis & {
  [TEST_SQL_BRIDGE_KEY]?: postgres.Sql;
};

function getTestBridge(): postgres.Sql | undefined {
  return (globalThis as GlobalWithBridge)[TEST_SQL_BRIDGE_KEY];
}

function setTestBridge(sql: postgres.Sql | undefined): void {
  (globalThis as GlobalWithBridge)[TEST_SQL_BRIDGE_KEY] = sql;
}

let sqlInstance: postgres.Sql | undefined;

/** Singleton lazy; lee DATABASE_URL del entorno. */
export function getSql(): postgres.Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const bridged = getTestBridge();
  if (bridged) {
    return bridged;
  }
  if (!sqlInstance) {
    sqlInstance = createSql(connectionString);
  }
  return sqlInstance;
}

/**
 * Apunta getSql() al cliente de tests (misma conexión).
 * Usa globalThis para sobrevivir duplicación de módulos $lib vs ruta relativa en vitest.
 */
export function setSqlForTests(sql: postgres.Sql): void {
  setTestBridge(sql);
  sqlInstance = sql;
}

/** Desvincula bridge sin cerrar la conexión. */
export function clearSqlForTests(): void {
  setTestBridge(undefined);
  sqlInstance = undefined;
}

/**
 * Reset para tests.
 * No cierra la conexión bridged; solo desvincula.
 * Cierra conexiones lazy creadas fuera del bridge (p. ej. db-stub).
 */
export async function resetSqlForTests(): Promise<void> {
  if (getTestBridge()) {
    clearSqlForTests();
    return;
  }
  if (sqlInstance) {
    await sqlInstance.end({ timeout: 5 });
    sqlInstance = undefined;
  }
}
