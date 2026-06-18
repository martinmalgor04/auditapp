import type { AuditReportRow } from '$lib/server/db/informe-reports';
import { tipoAuditoria } from '$lib/server/informe/tipo';

/** kebab-case ASCII: minúsculas, sin acentos, [^a-z0-9]+ → '-', colapsa y recorta guiones. */
export function slugify(input: string): string {
  const ascii = input.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'cliente'; // R7: fallback si la normalización deja vacío
}

/**
 * Nombre del archivo descargado, según la convención del repo (R7):
 * `YYYY-MM-DD_informe_<cliente-slug>_<tipo>_vN.html`.
 *
 * - fecha = `canonical.closed_at` (UTC, YYYY-MM-DD); si es null, fecha actual.
 * - cliente = `client.razon_social` normalizado a kebab-case ASCII.
 * - tipo = `it` / `erp` / `mixta` derivado de `tipoAuditoria(canonical.types)`.
 * - N = `report.version`.
 *
 * Se deriva del `canonicalJson` (fuente estable), no del modelo ya formateado.
 */
export function informeHtmlFilename(report: AuditReportRow): string {
  const closed = report.canonicalJson.closed_at;
  const date = (closed ? new Date(closed) : new Date()).toISOString().slice(0, 10);
  const cliente = slugify(report.canonicalJson.client.razon_social ?? '');
  const tipo = tipoAuditoria(report.canonicalJson.types); // 'erp' | 'it' | 'mixta'
  return `${date}_informe_${cliente}_${tipo}_v${report.version}.html`;
}
