import { stripInternalFindings } from '$lib/server/canonical/preview';
import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import type { AuditReportRow } from '$lib/server/db/informe-reports';
import type { InformeRenderModel, RenderClientDraft } from '$lib/informe/render';
import { resolveSectionDomain, tipoAuditoria } from './tipo';

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

/**
 * View-model del render imprimible (R26): datos públicos del snapshot canónico
 * (vía stripInternalFindings, R16) + client_draft. Nunca recibe internal_draft.
 */
export function buildInformeRenderModel(report: AuditReportRow): InformeRenderModel {
  if (!report.clientDraft) {
    throw new Error('El informe no tiene borrador para renderizar');
  }
  const canonical = stripInternalFindings(report.canonicalJson);
  const auditTipo = tipoAuditoria(canonical.types);

  return {
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
      domain: resolveSectionDomain(s, auditTipo)
    })),
    draft: report.clientDraft as RenderClientDraft,
    loomUrl: report.loomUrl
  };
}
