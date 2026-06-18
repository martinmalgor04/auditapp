import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/server/api/envelope';
import { requireReportReadAccess } from '$lib/server/api/guards';
import { getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { getAuditForReport } from '$lib/server/informe/access';
import { buildInformeRenderModel } from '$lib/server/informe/model';
import { renderInformeHtml } from '$lib/informe/render';
import { informeHtmlFilename } from '$lib/server/informe/download-name';
import { logger } from '$lib/server/logger';

/**
 * GET descarga del informe como `.html` (panel interno, #31).
 * Reusa exactamente la cadena `buildInformeRenderModel` + `renderInformeHtml`
 * que alimenta `report-render.svelte`, devolviendo el mismo string con
 * `Content-Disposition: attachment`. NUNCA es público (mismo guard que el detalle).
 */
export const GET: RequestHandler = async ({ params, locals }): Promise<Response> => {
  // 1. Cargar audit + report (404s) — mismo orden que loadAuditAndReport.
  const audit = await getAuditForReport(params.id!);
  if (!audit) return apiError('Auditoría no encontrada', 404); // R12

  const version = Number(params.version);
  if (!Number.isInteger(version) || version < 1) {
    return apiError('Versión inválida', 404); // R13
  }
  const report = await getReportByAuditVersion(audit.id, version);
  if (!report) return apiError('Informe no encontrado', 404); // R13

  // 2. Control de acceso (401/403) — mismo guard que el detalle de informe.
  const userOrResponse = requireReportReadAccess(locals, audit, report); // R9, R10
  if (userOrResponse instanceof Response) return userOrResponse;

  // 3. Render reutilizado, idéntico al panel (con timestamps de visita, sin editMode).
  let html: string;
  try {
    const timestamps = { startedAt: audit.startedAt, finishedAt: audit.finishedAt }; // R18
    const model = buildInformeRenderModel(report, timestamps); // R2, R3, R18
    html = renderInformeHtml(model); // R2, R3, R4
  } catch (err) {
    logger.error('informe_html_download_failed', { auditId: audit.id, version }, err);
    return apiError('El informe no se puede descargar todavía', 409); // R14
  }

  // 4. Entrega como descarga.
  const filename = informeHtmlFilename(report); // R7
  return new Response(html, {
    status: 200, // R8
    headers: {
      'Content-Type': 'text/html; charset=utf-8', // R5
      'Content-Disposition': `attachment; filename="${filename}"` // R6
    }
  });
};
