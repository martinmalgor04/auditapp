import type { EmpresaExportRow } from '$lib/server/db/empresa';

/**
 * #23 Fase 5 (R26) — Serialización CSV del listado filtrado de empresas.
 *
 * Formato: separador `,`, cada campo entrecomillado con `"` y comillas internas duplicadas (RFC
 * 4180), salto de línea `\r\n`. Se antepone un BOM UTF-8 en el endpoint para que Excel respete los
 * acentos. El orden y el set de columnas refleja los datos maestros del cockpit.
 */

export const EMPRESA_CSV_HEADERS = [
  'razon_social',
  'cuit',
  'relacion',
  'estado',
  'estado_source',
  'rubro',
  'empleados',
  'referente_nombre',
  'referente_contacto',
  'erp_actual',
  'direccion',
  'provincia',
  'telefono',
  'email'
] as const;

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowToCells(row: EmpresaExportRow): string[] {
  return [
    row.razonSocial,
    row.cuit,
    row.relacion,
    row.estado,
    row.estadoSource,
    row.rubro,
    row.empleados,
    row.referenteNombre,
    row.referenteContacto,
    row.erpActual,
    row.direccion,
    row.provincia,
    row.telefono,
    row.email
  ].map(csvCell);
}

export function empresasToCsv(rows: EmpresaExportRow[]): string {
  const lines: string[] = [];
  lines.push(EMPRESA_CSV_HEADERS.map(csvCell).join(','));
  for (const row of rows) {
    lines.push(rowToCells(row).join(','));
  }
  return lines.join('\r\n');
}
