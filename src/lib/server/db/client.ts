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

/** Reset interno para tests. */
export function resetSqlForTests(): void {
  sqlInstance = undefined;
}
