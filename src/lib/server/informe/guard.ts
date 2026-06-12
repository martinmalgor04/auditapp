import {
  expireStaleGeneratingRow,
  type AuditReportRow
} from '$lib/server/db/informe-reports';

export const INFORME_GENERATION_TIMEOUT_MS_DEFAULT = 300_000;

export function resolveGenerationTimeoutMs(): number {
  const raw = process.env.INFORME_GENERATION_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : INFORME_GENERATION_TIMEOUT_MS_DEFAULT;
}

/**
 * Guard perezoso (R14): si la fila lleva en `generando` más que el timeout,
 * la persiste como `error` y devuelve la fila actualizada.
 */
export async function expireStaleGenerating(report: AuditReportRow): Promise<AuditReportRow> {
  if (report.status !== 'generando') {
    return report;
  }
  const timeoutMs = resolveGenerationTimeoutMs();
  const expired = await expireStaleGeneratingRow(
    report.id,
    timeoutMs,
    `Generación expirada por timeout (${timeoutMs} ms sin progreso)`
  );
  return expired ?? report;
}
