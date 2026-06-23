import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type postgres from 'postgres';
import { createSeedCodigoAllocator } from './clients';

type DbExecutor = postgres.Sql | postgres.TransactionSql;

const CSV_PATH = join(process.cwd(), 'seed', 'clientes-tango.csv');

const ERP_BY_TIPO: Record<string, string> = {
  GESTION: 'Tango Gestión',
  RESTO: 'Tango Restó',
  'PUNTO DE VENTA': 'Tango Punto de Venta',
  'ESTUDIOS CONT': 'Tango Estudios Contables',
  I: 'Tango'
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseIntOrNull(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

function parseBoolOrNull(value: string | undefined): boolean | null {
  const trimmed = value?.trim().toUpperCase();
  if (trimmed === 'SI') return true;
  if (trimmed === 'NO') return false;
  return null;
}

/**
 * Clientes fijos Tango (renuevan año a año) desde seed/clientes-tango.csv.
 * Los que ya existen por el seed de presupuestos (mismo id) se enriquecen con
 * los datos de licencia sin pisar campos cargados que acá vengan vacíos.
 */
export async function seedClientesTango(sql: DbExecutor): Promise<number> {
  let content: string;
  try {
    content = await readFile(CSV_PATH, 'utf8');
  } catch {
    throw new Error('seed/clientes-tango.csv not found');
  }

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true
  }) as Record<string, string>[];

  const existingRows = await sql<{ id: string; codigo: string }[]>`
    SELECT id::text, codigo FROM empresa
  `;
  const codigoById = new Map(existingRows.map((r) => [r.id, r.codigo]));
  const nextCodigo = createSeedCodigoAllocator(existingRows.map((r) => r.codigo));

  let count = 0;
  for (const row of records) {
    const tipo = emptyToNull(row.tipo);
    const codigo = codigoById.get(row.id) ?? nextCodigo(row.razon_social);
    await sql`
      INSERT INTO empresa (
        id, razon_social, referente_nombre, telefono, email, erp_actual, origen, relacion,
        codigo, tango_tipo, tango_terminales, tango_version, tango_version_detectada,
        tango_lic_categoria, tango_sueldos, tango_venc_escala, tango_motivo
      )
      VALUES (
        ${row.id}::uuid,
        ${row.razon_social},
        ${emptyToNull(row.contacto)},
        ${emptyToNull(row.telefono)},
        ${emptyToNull(row.email)},
        ${tipo ? (ERP_BY_TIPO[tipo] ?? 'Tango') : null},
        'tango',
        'cliente',
        ${codigo},
        ${tipo},
        ${parseIntOrNull(row.terminales)},
        ${emptyToNull(row.version)},
        ${emptyToNull(row.version_detectada)},
        ${emptyToNull(row.lic_categoria)},
        ${parseBoolOrNull(row.sueldos)},
        ${emptyToNull(row.venc_escala)},
        ${emptyToNull(row.motivo)}
      )
      ON CONFLICT (id) DO UPDATE SET
        referente_nombre = COALESCE(EXCLUDED.referente_nombre, empresa.referente_nombre),
        telefono = COALESCE(EXCLUDED.telefono, empresa.telefono),
        email = COALESCE(EXCLUDED.email, empresa.email),
        erp_actual = COALESCE(EXCLUDED.erp_actual, empresa.erp_actual),
        origen = 'tango',
        tango_tipo = EXCLUDED.tango_tipo,
        tango_terminales = EXCLUDED.tango_terminales,
        tango_version = EXCLUDED.tango_version,
        tango_version_detectada = EXCLUDED.tango_version_detectada,
        tango_lic_categoria = EXCLUDED.tango_lic_categoria,
        tango_sueldos = EXCLUDED.tango_sueldos,
        tango_venc_escala = EXCLUDED.tango_venc_escala,
        tango_motivo = EXCLUDED.tango_motivo,
        updated_at = now()
    `;
    count++;
  }

  return count;
}
