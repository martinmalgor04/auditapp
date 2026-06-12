import { stripInternalFindings } from '$lib/server/canonical/preview';
import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import type { AuditReportRow } from '$lib/server/db/informe-reports';
import type { InformeRenderModel, RenderClientDraft } from '$lib/informe/render';

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

function tipoAuditoria(types: string[]): 'erp' | 'it' | 'mixta' {
  const hasErp = types.some((t) => t.startsWith('erp'));
  const hasIt = types.includes('it');
  if (hasErp && hasIt) return 'mixta';
  if (hasIt) return 'it';
  return 'erp';
}

/**
 * View-model del render imprimible (R26): datos públicos del snapshot canónico
 * (vía stripInternalFindings, R16) + client_draft. Nunca recibe internal_draft.
 */
export function buildInformeRenderModel(report: AuditReportRow): InformeRenderModel {
  if (!report.clientDraft) {
    throw new Error('El informe no tiene borrador para renderizar');
  }
  const canonical = stripInternalFindings(report.canonicalJson);

  return {
    cliente: {
      razonSocial: canonical.client.razon_social,
      cuit: canonical.client.cuit,
      rubro: canonical.client.rubro
    },
    periodo: periodoFrom(canonical.closed_at),
    fechaInforme: fechaLarga(canonical.closed_at),
    tipoAuditoria: tipoAuditoria(canonical.types),
    modulos: canonical.market_data.modulos_tango ?? [],
    sistema:
      canonical.market_data.erp_actual ??
      (canonical.types.includes('erp-tango') ? 'Tango Gestión' : '—'),
    secciones: canonical.sections.map((s) => ({
      code: s.code,
      title: s.title,
      score: s.score,
      semaforo: s.score !== null ? indexToSemaphore(s.score) : null
    })),
    draft: report.clientDraft as RenderClientDraft,
    loomUrl: report.loomUrl
  };
}
