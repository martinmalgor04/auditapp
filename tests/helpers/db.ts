import type postgres from 'postgres';
import { createSql, resetSqlForTests, setSqlForTests } from '../../src/lib/server/db/client';

let sharedSql: postgres.Sql | undefined;

export function getTestSql(): postgres.Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — required for DB integration tests');
  }
  if (!sharedSql) {
    sharedSql = createSql(connectionString);
  }
  return sharedSql;
}

export async function setupTestDb(): Promise<postgres.Sql> {
  await resetSqlForTests();
  return getTestSql();
}

export async function teardownTestDb(): Promise<void> {
  if (sharedSql) {
    await sharedSql.end({ timeout: 5 });
    sharedSql = undefined;
  }
  await resetSqlForTests();
}

/** Trunca tablas de datos preservando schema_migration. */
export async function truncateSeedTables(sql: postgres.Sql): Promise<void> {
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
