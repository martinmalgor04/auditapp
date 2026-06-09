import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type postgres from 'postgres';

export type MigrationResult = { applied: string[]; skipped: string[] };

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

/** Lee migrations/*.sql y aplica los no registrados en schema_migration. */
export async function runMigrations(sql: postgres.Sql): Promise<MigrationResult> {
  const applied: string[] = [];
  const skipped: string[] = [];

  const [{ exists: hasMigrationTable }] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'schema_migration'
    ) AS exists
  `;

  const rows = hasMigrationTable
    ? await sql<{ version: string }[]>`SELECT version FROM schema_migration`
    : [];
  const appliedSet = new Set(rows.map((r) => r.version));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (appliedSet.has(version)) {
      skipped.push(version);
      continue;
    }

    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migration (version) VALUES (${version})`;
    });
    applied.push(version);
  }

  return { applied, skipped };
}

/** Elimina todas las tablas del schema public (solo dev/test). */
export async function resetDatabase(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);
}
