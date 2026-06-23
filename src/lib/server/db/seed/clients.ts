import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type postgres from 'postgres';
import { buildEmpresaCode } from '$lib/server/clients/normalize';

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

/** Reserva codigos únicos contra DB + lote en curso (#41). */
export function createSeedCodigoAllocator(existingCodigos: Iterable<string>) {
  const used = new Set(existingCodigos);
  return (razonSocial: string): string => {
    const base = buildEmpresaCode(razonSocial);
    for (let n = 0; ; n++) {
      const candidate = n === 0 ? base : `${base}${n + 1}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  };
}

/** Resuelve codigo único consultando la DB (tests y upserts sueltos). */
export async function resolveUniqueCodigoDb(
  sql: DbExecutor,
  razonSocial: string,
  empresaId?: string
): Promise<string> {
  const base = buildEmpresaCode(razonSocial);
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? base : `${base}${n + 1}`;
    const [exists] = await sql<{ id: string }[]>`
      SELECT id FROM empresa
      WHERE codigo = ${candidate}
        AND (${empresaId ?? null}::uuid IS NULL OR id <> ${empresaId ?? null}::uuid)
      LIMIT 1
    `;
    if (!exists) return candidate;
  }
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

  const existingRows = await sql<{ id: string; codigo: string }[]>`
    SELECT id::text, codigo FROM empresa
  `;
  const codigoById = new Map(existingRows.map((r) => [r.id, r.codigo]));
  const nextCodigo = createSeedCodigoAllocator(existingRows.map((r) => r.codigo));

  let count = 0;
  for (const row of records) {
    const codigo = codigoById.get(row.id) ?? nextCodigo(row.razon_social);
    await sql`
      INSERT INTO empresa (
        id, razon_social, cuit, direccion, cp, provincia,
        telefono, email, origen, relacion, codigo, created_at, updated_at
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
        'presupuestos',
        'cliente',
        ${codigo},
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
