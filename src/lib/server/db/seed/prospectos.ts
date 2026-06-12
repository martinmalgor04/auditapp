import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type postgres from 'postgres';

type DbExecutor = postgres.Sql | postgres.TransactionSql;

const CSV_PATH = join(process.cwd(), 'seed', 'prospectos.csv');

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Prospectos del relevamiento comercial (formulario de calle + base de
 * contactos) desde seed/prospectos.csv.
 */
export async function seedProspectos(sql: DbExecutor): Promise<number> {
  let content: string;
  try {
    content = await readFile(CSV_PATH, 'utf8');
  } catch {
    throw new Error('seed/prospectos.csv not found');
  }

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true
  }) as Record<string, string>[];

  let count = 0;
  for (const row of records) {
    const tieneSoftware = emptyToNull(row.tiene_software);
    const observaciones = [
      tieneSoftware ? `Tiene software de gestión: ${tieneSoftware}.` : null,
      emptyToNull(row.observaciones)
    ]
      .filter(Boolean)
      .join(' ');
    await sql`
      INSERT INTO client (
        id, razon_social, referente_nombre, telefono, email, direccion, rubro,
        pagina, origen, nivel_interes, observaciones, relevado_at
      )
      VALUES (
        ${row.id}::uuid,
        ${row.razon_social},
        ${emptyToNull(row.referente)},
        ${emptyToNull(row.telefono)},
        ${emptyToNull(row.email)},
        ${emptyToNull(row.direccion)},
        ${emptyToNull(row.rubro)},
        ${emptyToNull(row.pagina)},
        'prospecto',
        ${emptyToNull(row.nivel_interes)},
        ${emptyToNull(observaciones)},
        ${emptyToNull(row.relevado_at)}
      )
      ON CONFLICT (id) DO UPDATE SET
        referente_nombre = COALESCE(EXCLUDED.referente_nombre, client.referente_nombre),
        telefono = COALESCE(EXCLUDED.telefono, client.telefono),
        email = COALESCE(EXCLUDED.email, client.email),
        direccion = COALESCE(EXCLUDED.direccion, client.direccion),
        rubro = COALESCE(EXCLUDED.rubro, client.rubro),
        pagina = COALESCE(EXCLUDED.pagina, client.pagina),
        origen = 'prospecto',
        nivel_interes = EXCLUDED.nivel_interes,
        observaciones = EXCLUDED.observaciones,
        relevado_at = EXCLUDED.relevado_at,
        updated_at = now()
    `;
    count++;
  }

  return count;
}
