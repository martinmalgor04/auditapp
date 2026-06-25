import { stripInternalFindings } from '$lib/server/canonical/preview';
import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import type { AuditReportRow } from '$lib/server/db/informe-reports';
import type {
  InformeRenderModel,
  RenderClientDraft,
  RenderSemaphore
} from '$lib/informe/render';
import { resolveSectionDomain, tipoAuditoria } from './tipo';
import { formatVisita } from '$lib/informe/visita';
import { scoreInventoryRow } from '$lib/server/scoring/inventory-eol';
import {
  resolveInventoryColumns,
  type InventoryColumn
} from '$lib/informe/inventory-columns';
import { buildPublicObjectUrl } from '$lib/server/storage/presign';
import type { CanonicalAudit, CanonicalItemRow } from '$lib/server/canonical/schema';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
];

function periodoFrom(closedAt: string | null): string {
  if (!closedAt) return '';
  const d = new Date(closedAt);
  const mes = MESES[d.getUTCMonth()];
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${d.getUTCFullYear()}`;
}

function fechaLarga(closedAt: string | null): string {
  if (!closedAt) return '';
  const d = new Date(closedAt);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

type CellMap = Record<string, unknown>;

/** Texto legible de una celda (vacío si no hay dato). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function pointsToSemaphore(points: 0 | 50 | 100 | null): RenderSemaphore | null {
  if (points === 0) return 'red';
  if (points === 50) return 'amber';
  if (points === 100) return 'green';
  return null;
}

/**
 * #45 (R6, R7, R11) — convierte una fila canónica de inventario en un equipo del
 * modelo. Usa `resolveInventoryColumns` para mapear las columnas (derivadas de
 * las keys de `cells`) a los roles tipo/modelo/antigüedad/EOL, `scoreInventoryRow`
 * para el semáforo y `photoUrl` para resolver las claves R2 a URLs.
 */
function rowToEquipo(
  row: CanonicalItemRow,
  refDate: Date,
  photoUrl: (r2Key: string) => string
): InformeRenderModel['inventarioIt'][number] {
  const cells = row.cells as CellMap;
  const columns: InventoryColumn[] = Object.keys(cells).map((key) => ({
    key,
    label: key,
    type: 'text'
  }));
  const cols = resolveInventoryColumns(columns);

  const tipo = cols.tipoKey ? cellText(cells[cols.tipoKey]) : '';
  const modeloCategoria = cols.modeloKey ? cellText(cells[cols.modeloKey]) : '';
  const antiguedad = cols.antiguedadKey ? cellText(cells[cols.antiguedadKey]) : '';
  const estadoEol = cols.eolKey ? cellText(cells[cols.eolKey]) : '';

  const { points } = scoreInventoryRow(cells, refDate);
  const semaforo = pointsToSemaphore(points);

  const altBase = [tipo, modeloCategoria].filter(Boolean).join(' ') || 'Equipo relevado';
  const fotos = row.attachments.map((key) => ({ url: photoUrl(key), alt: altBase }));

  return { tipo, modeloCategoria, antiguedad, estadoEol, semaforo, fotos };
}

/**
 * #45 (R5, R6, R8) — deriva el inventario IT del snapshot canónico ya pasado por
 * stripInternalFindings. Recorre secciones de dominio IT, toma ítems table con
 * filas y construye un equipo por fila. ERP puro → vacío (filtrado por dominio).
 */
function deriveInventarioIt(
  canonical: CanonicalAudit,
  auditTipo: 'erp' | 'it' | 'mixta',
  photoUrl: (r2Key: string) => string
): InformeRenderModel['inventarioIt'] {
  const refDate = new Date(canonical.closed_at ?? canonical.generated_at);
  const equipos: InformeRenderModel['inventarioIt'] = [];

  for (const section of canonical.sections) {
    if (resolveSectionDomain(section, auditTipo) !== 'it') continue;
    for (const item of section.items) {
      if (item.field_type !== 'table') continue;
      const rows = item.rows ?? [];
      for (const row of rows) {
        const equipo = rowToEquipo(row, refDate, photoUrl);
        // Solo equipos con algún dato identificable (evita filas vacías).
        if (equipo.tipo || equipo.modeloCategoria || equipo.antiguedad || equipo.estadoEol) {
          equipos.push(equipo);
        }
      }
    }
  }

  return equipos;
}

/** Resolvedor por defecto de fotos: URL pública de R2 o placeholder vacío. */
function defaultPhotoUrl(r2Key: string): string {
  return buildPublicObjectUrl(r2Key) ?? '';
}

/**
 * View-model del render imprimible (R26): datos públicos del snapshot canónico
 * (vía stripInternalFindings, R16) + client_draft. Nunca recibe internal_draft.
 *
 * @param options Opcional: timestamps de visita, ref_code de audit (#41) y
 *   resolvedor de fotos de inventario (#45, inyectable para tests).
 */
export function buildInformeRenderModel(
  report: AuditReportRow,
  options?: {
    startedAt?: Date | null;
    finishedAt?: Date | null;
    refCode?: string;
    photoUrl?: (r2Key: string) => string;
  }
): InformeRenderModel {
  if (!report.clientDraft) {
    throw new Error('El informe no tiene borrador para renderizar');
  }
  const canonical = stripInternalFindings(report.canonicalJson);
  const auditTipo = tipoAuditoria(canonical.types);

  let visita: InformeRenderModel['visita'] = undefined;
  if (options) {
    const v = formatVisita({
      startedAt: options.startedAt ?? null,
      finishedAt: options.finishedAt ?? null
    });
    if (v && v.finStr) {
      visita = { inicio: v.inicioStr, fin: v.finStr, duracionMin: v.duracionMin };
    }
  }

  return {
    refCode: options?.refCode ?? '—',
    cliente: {
      razonSocial: canonical.client.razon_social,
      cuit: canonical.client.cuit,
      rubro: canonical.client.rubro
    },
    periodo: periodoFrom(canonical.closed_at),
    fechaInforme: fechaLarga(canonical.closed_at),
    tipoAuditoria: auditTipo,
    modulos: canonical.market_data.modulos_tango ?? [],
    sistema:
      canonical.market_data.erp_actual ??
      (canonical.types.includes('erp-tango') ? 'Tango Gestión' : '—'),
    secciones: canonical.sections.map((s) => ({
      code: s.code,
      title: s.title,
      score: s.score,
      semaforo: s.score !== null ? indexToSemaphore(s.score) : null,
      domain: resolveSectionDomain(s, auditTipo),
      standardRef: s.standard_ref ?? null
    })),
    draft: report.clientDraft as RenderClientDraft,
    inventarioIt: deriveInventarioIt(
      canonical,
      auditTipo,
      options?.photoUrl ?? defaultPhotoUrl
    ),
    loomUrl: report.loomUrl,
    visita
  };
}
