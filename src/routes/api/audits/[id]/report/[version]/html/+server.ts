import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/server/api/envelope';
import { requireReportReadAccess } from '$lib/server/api/guards';
import { getReportByAuditVersion, getReportManualHtml } from '$lib/server/db/informe-reports';
import { getAuditForReport } from '$lib/server/informe/access';
import { buildInformeRenderModel } from '$lib/server/informe/model';
import { renderInformeHtml } from '$lib/informe/render';
import { informeHtmlFilename } from '$lib/server/informe/download-name';
import { logger } from '$lib/server/logger';

/**
 * GET descarga del informe como `.html` (panel interno, #31).
 * Para `source='ia'` reusa la cadena `buildInformeRenderModel` + `renderInformeHtml`.
 * Para `source='manual'` (#55) devuelve `html_manual` byte a byte, SIN encuesta
 * inyectada (R29, R30 round-trip). `?inline=1` cambia el header a `inline` para
 * previsualización interna (R31). NUNCA es público (mismo guard que el detalle).
 */
export const GET: RequestHandler = async ({ params, locals, url }): Promise<Response> => {
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

  const filename = informeHtmlFilename(report); // R7
  const disposition = url.searchParams.get('inline') === '1' ? 'inline' : 'attachment'; // R31

  // 3. Versión manual (#55 R29): html_manual tal cual, sin pasar por el renderer IA.
  if (report.source === 'manual') {
    const html = await getReportManualHtml(report.id);
    if (!html) {
      return apiError('El informe no se puede descargar todavía', 409);
    }
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `${disposition}; filename="${filename}"`
      }
    });
  }

  // 4. Render IA reutilizado, idéntico al panel (con timestamps de visita, sin editMode).
  let html: string;
  try {
    const timestamps = {
      startedAt: audit.startedAt,
      finishedAt: audit.finishedAt,
      refCode: audit.refCode
    };
    const model = buildInformeRenderModel(report, timestamps);
    html = renderInformeHtml(model); // R2, R3, R4
  } catch (err) {
    logger.error('informe_html_download_failed', { auditId: audit.id, version }, err);
    return apiError('El informe no se puede descargar todavía', 409); // R14
  }

  // 5. Entrega como descarga.
  return new Response(html, {
    status: 200, // R8
    headers: {
      'Content-Type': 'text/html; charset=utf-8', // R5
      'Content-Disposition': `${disposition}; filename="${filename}"` // R6
    }
  });
};
