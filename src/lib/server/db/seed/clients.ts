import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type postgres from 'postgres';

type DbExecutor = postgres.Sql | postgres.TransactionSql;

const CSV_PATH = join(process.cwd(), 'seed', 'clientes-presupuestossys.csv');

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseTimestamptz(value: string | undefined): Date {
  const trimmed = value?.trim();
  if (!trimmed) {
    return new Date();
  }
  const normalized = trimmed.replace(' ', 'T').replace(/\+00$/, '+00:00');
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) {
    return new Date();
  }
  return new Date(ms);
}

export async function seedClients(sql: DbExecutor): Promise<number> {
  let content: string;
  try {
    content = await readFile(CSV_PATH, 'utf8');
  } catch {
    throw new Error('seed/clientes-presupuestossys.csv not found');
  }

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true
  }) as Record<string, string>[];

  let count = 0;
  for (const row of records) {
    await sql`
      INSERT INTO client (
        id, razon_social, cuit, direccion, cp, provincia,
        telefono, email, created_at, updated_at
      )
      VALUES (
        ${row.id}::uuid,
        ${row.razon_social},
        ${emptyToNull(row.numero_doc)},
        ${emptyToNull(row.direccion)},
        ${emptyToNull(row.cp)},
        ${emptyToNull(row.provincia)},
        ${emptyToNull(row.telefono)},
        ${emptyToNull(row.email)},
        ${parseTimestamptz(row.created_at)},
        ${parseTimestamptz(row.updated_at)}
      )
      ON CONFLICT (id) DO UPDATE SET
        razon_social = EXCLUDED.razon_social,
        cuit = EXCLUDED.cuit,
        direccion = EXCLUDED.direccion,
        cp = EXCLUDED.cp,
        provincia = EXCLUDED.provincia,
        telefono = EXCLUDED.telefono,
        email = EXCLUDED.email,
        updated_at = EXCLUDED.updated_at
    `;
    count++;
  }

  return count;
}
