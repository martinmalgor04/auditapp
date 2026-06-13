import { getSql } from '$lib/server/db/client';
import { apiError } from '$lib/server/api/envelope';
import { AuditNotFoundError } from '$lib/server/backoffice/errors';
import {
  InformeAuditNotClosedError,
  InformeDraftValidationError,
  InformeInvalidTransitionError,
  InformeNotConfiguredError,
  InformeReportNotApprovedError,
  InformeReportNotFoundError,
  InformeShareNotFoundError
} from './errors';

export type AuditForReport = {
  id: string;
  status: string;
  assignedTechId: string | null;
};

export async function getAuditForReport(auditId: string): Promise<AuditForReport | null> {
  const sql = getSql();
  const [row] = await sql<{ id: string; status: string; assigned_tech_id: string | null }[]>`
    SELECT id, status, assigned_tech_id
    FROM audit
    WHERE id = ${auditId} AND archived_at IS NULL
    LIMIT 1
  `;
  return row ? { id: row.id, status: row.status, assignedTechId: row.assigned_tech_id } : null;
}

/** Mapeo de errores de dominio informe → Response (envelope estándar). */
export function informeErrorResponse(err: unknown): Response {
  if (
    err instanceof AuditNotFoundError ||
    err instanceof InformeReportNotFoundError ||
    err instanceof InformeShareNotFoundError
  ) {
    return apiError(err.message, 404);
  }
  if (err instanceof InformeAuditNotClosedError || err instanceof InformeReportNotApprovedError) {
    return apiError(err.message, 409);
  }
  if (err instanceof InformeNotConfiguredError) {
    return apiError(err.message, 503);
  }
  if (err instanceof InformeInvalidTransitionError) {
    return apiError(err.message, 409);
  }
  if (err instanceof InformeDraftValidationError) {
    return apiError(err.message, 400);
  }
  return apiError('Error interno', 500);
}
