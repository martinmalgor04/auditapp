import postgres from 'postgres';

/** Crea cliente postgres.js; no conecta hasta la primera query. */
export function createSql(connectionString: string): postgres.Sql {
  return postgres(connectionString, { max: 1 });
}

let sqlInstance: postgres.Sql | undefined;

/** Singleton lazy; lee DATABASE_URL del entorno. */
export function getSql(): postgres.Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!sqlInstance) {
    sqlInstance = createSql(connectionString);
  }
  return sqlInstance;
}

/** Apunta el singleton de app al cliente de tests (misma conexión). */
export function setSqlForTests(sql: postgres.Sql): void {
  sqlInstance = sql;
}

/** Reset interno para tests; cierra el singleton de app. */
export async function resetSqlForTests(): Promise<void> {
  if (sqlInstance) {
    await sqlInstance.end({ timeout: 5 });
    sqlInstance = undefined;
  }
}
