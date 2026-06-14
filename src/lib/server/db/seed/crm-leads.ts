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

/** Arma la nota del lead a partir de los datos del relevamiento. */
function buildNotas(row: Record<string, string>): string | null {
  const lines: string[] = [];
  const relevado = emptyToNull(row.relevado_at);
  if (row.fuente === 'formulario' && relevado) {
    lines.push(`Relevado en calle el ${relevado.slice(0, 10)}.`);
  } else if (row.fuente === 'base_contactos') {
    lines.push('Origen: base de contactos.');
  }
  const interes = emptyToNull(row.nivel_interes);
  if (interes) lines.push(`Interés: ${interes}.`);
  const software = emptyToNull(row.tiene_software);
  if (software) lines.push(`Tiene software de gestión: ${software}.`);
  const rubro = emptyToNull(row.rubro);
  if (rubro) lines.push(`Rubro: ${rubro}.`);
  const direccion = emptyToNull(row.direccion);
  if (direccion) lines.push(`Dirección: ${direccion}.`);
  const pagina = emptyToNull(row.pagina);
  if (pagina) lines.push(`Web: ${pagina}.`);
  const obs = emptyToNull(row.observaciones);
  if (obs) lines.push(obs);
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Carga los prospectos del relevamiento comercial como leads del CRM
 * (seed/prospectos.csv → crm_lead). source='manual'. Los que vienen del
 * formulario (visitados físicamente) entran como 'contactado'; los de la
 * base de contactos sueltos, como 'lead'.
 *
 * Idempotente por id determinístico (no por email, porque muchos no tienen).
 */
export async function seedCrmLeads(sql: DbExecutor): Promise<number> {
  let content: string;
  try {
    content = await readFile(CSV_PATH, 'utf8');
  } catch {
    throw new Error('seed/prospectos.csv not found');
  }

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true
  }) as Record<string, string>[];

  let count = 0;
  for (const row of records) {
    const empresa = row.razon_social?.trim();
    if (!empresa) continue;
    const status = row.fuente === 'formulario' ? 'contactado' : 'lead';
    await sql`
      INSERT INTO crm_lead (
        id, email, empresa, contacto, telefono, source, status, notas
      )
      VALUES (
        ${row.id}::uuid,
        ${emptyToNull(row.email)},
        ${empresa},
        ${emptyToNull(row.referente)},
        ${emptyToNull(row.telefono)},
        'manual',
        ${status},
        ${buildNotas(row)}
      )
      ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, crm_lead.email),
        empresa = EXCLUDED.empresa,
        contacto = COALESCE(EXCLUDED.contacto, crm_lead.contacto),
        telefono = COALESCE(EXCLUDED.telefono, crm_lead.telefono),
        notas = EXCLUDED.notas,
        updated_at = now()
    `;
    count++;
  }

  return count;
}
