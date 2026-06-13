import { getSql } from './client';
import type { CanonicalAudit } from '$lib/server/canonical/schema';
import type { ContextMeta } from '$lib/server/informe/context/schemas';
import type { ReportClientDraft, ReportInternalDraft } from '$lib/server/informe/schemas';
import { assertInformeTransition, type InformeStatus } from '$lib/server/informe/state';
import { InformeInvalidTransitionError } from '$lib/server/informe/errors';

export type AuditReportRow = {
  id: string;
  auditId: string;
  version: number;
  status: InformeStatus;
  canonicalJson: CanonicalAudit;
  schemaVersion: string;
  clientDraft: ReportClientDraft | null;
  internalDraft: ReportInternalDraft | null;
  promptVersion: string | null;
  model: string | null;
  errorMessage: string | null;
  loomUrl: string | null;
  requestedBy: string;
  editedBy: string | null;
  editedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  ejemplar: boolean;
  contextMeta: ContextMeta | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AuditReportEditRow = {
  id: string;
  reportId: string;
  seq: number;
  clientDraft: ReportClientDraft;
  changeSummary: string;
  editedBy: string;
  editedAt: Date;
};

const REPORT_COLUMNS = `
  id, audit_id, version, status, canonical_json, schema_version,
  client_draft, internal_draft, prompt_version, model, error_message, loom_url,
  requested_by, edited_by, edited_at, approved_by, approved_at,
  ejemplar, context_meta, created_at, updated_at
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): AuditReportRow {
  return {
    id: row.id,
    auditId: row.audit_id,
    version: row.version,
    status: row.status,
    canonicalJson: row.canonical_json,
    schemaVersion: row.schema_version,
    clientDraft: row.client_draft,
    internalDraft: row.internal_draft,
    promptVersion: row.prompt_version,
    model: row.model,
    errorMessage: row.error_message,
    loomUrl: row.loom_url,
    requestedBy: row.requested_by,
    editedBy: row.edited_by,
    editedAt: row.edited_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    ejemplar: row.ejemplar ?? false,
    contextMeta: row.context_meta ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** INSERT con version = COALESCE(MAX)+1 atómico por auditoría (R4, R21). */
export async function insertReport(input: {
  auditId: string;
  canonicalJson: CanonicalAudit;
  schemaVersion: string;
  requestedBy: string;
}): Promise<AuditReportRow> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `INSERT INTO audit_report (audit_id, version, status, canonical_json, schema_version, requested_by)
     SELECT $1, COALESCE(MAX(version), 0) + 1, 'pendiente', $2::jsonb, $3, $4
     FROM audit_report WHERE audit_id = $1
     RETURNING ${REPORT_COLUMNS}`,
    [input.auditId, input.canonicalJson as never, input.schemaVersion, input.requestedBy]
  );
  return mapRow(rows[0]);
}

export async function getReportById(id: string): Promise<AuditReportRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT ${REPORT_COLUMNS} FROM audit_report WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getReportByAuditVersion(
  auditId: string,
  version: number
): Promise<AuditReportRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT ${REPORT_COLUMNS} FROM audit_report WHERE audit_id = $1 AND version = $2 LIMIT 1`,
    [auditId, version]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listReportsByAudit(auditId: string): Promise<AuditReportRow[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT ${REPORT_COLUMNS} FROM audit_report WHERE audit_id = $1 ORDER BY version DESC`,
    [auditId]
  );
  return rows.map(mapRow);
}

/** Última versión aprobada de informe para una auditoría (#16 R2). */
export async function getLatestApprovedReport(auditId: string): Promise<AuditReportRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT ${REPORT_COLUMNS}
     FROM audit_report
     WHERE audit_id = $1 AND status = 'aprobado'
     ORDER BY version DESC
     LIMIT 1`,
    [auditId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Transición atómica de estado: UPDATE ... WHERE id AND status = from (R7).
 * Lanza InformeInvalidTransitionError si la transición no es válida o la fila cambió.
 */
export async function updateReportStatus(
  id: string,
  from: InformeStatus,
  to: InformeStatus,
  extra?: { errorMessage?: string }
): Promise<AuditReportRow> {
  assertInformeTransition(from, to);
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_report
     SET status = $3, error_message = $4, updated_at = now()
     WHERE id = $1 AND status = $2
     RETURNING ${REPORT_COLUMNS}`,
    [id, from, to, to === 'error' ? (extra?.errorMessage ?? 'Error desconocido') : null]
  );
  if (rows.length !== 1) {
    throw new InformeInvalidTransitionError(from, to);
  }
  return mapRow(rows[0]);
}

/** Persiste drafts + metadatos y transiciona generando→borrador en un solo UPDATE. */
export async function saveDraftsAndFinish(input: {
  id: string;
  clientDraft: ReportClientDraft;
  internalDraft: ReportInternalDraft;
  promptVersion: string;
  model: string;
  contextMeta?: ContextMeta | null;
}): Promise<AuditReportRow> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_report
     SET status = 'borrador', client_draft = $2::jsonb, internal_draft = $3::jsonb,
         prompt_version = $4, model = $5, error_message = NULL,
         context_meta = $6::jsonb, updated_at = now()
     WHERE id = $1 AND status = 'generando'
     RETURNING ${REPORT_COLUMNS}`,
    [
      input.id,
      input.clientDraft as never,
      input.internalDraft as never,
      input.promptVersion,
      input.model,
      input.contextMeta ?? null
    ]
  );
  if (rows.length !== 1) {
    throw new InformeInvalidTransitionError('generando', 'borrador');
  }
  return mapRow(rows[0]);
}

/** Marca error desde generando, sin drafts parciales (R13). */
export async function markReportError(
  id: string,
  errorMessage: string,
  meta?: { promptVersion?: string; model?: string; contextMeta?: ContextMeta | null }
): Promise<void> {
  const sql = getSql();
  await sql.unsafe(
    `UPDATE audit_report
     SET status = 'error', error_message = $2, client_draft = NULL, internal_draft = NULL,
         prompt_version = COALESCE($3, prompt_version), model = COALESCE($4, model),
         context_meta = COALESCE($5::jsonb, context_meta), updated_at = now()
     WHERE id = $1 AND status = 'generando'`,
    [
      id,
      errorMessage || 'Error desconocido',
      meta?.promptVersion ?? null,
      meta?.model ?? null,
      meta?.contextMeta ?? null
    ]
  );
}

/** Edición humana del draft (solo borrador, R20). */
export async function saveClientDraftEdit(
  id: string,
  clientDraft: ReportClientDraft,
  editedBy: string
): Promise<AuditReportRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_report
     SET client_draft = $2::jsonb, edited_by = $3, edited_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'borrador'
     RETURNING ${REPORT_COLUMNS}`,
    [id, clientDraft as never, editedBy]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Loom URL editable solo en borrador (R25). */
export async function saveLoomUrl(
  id: string,
  loomUrl: string | null,
  editedBy: string
): Promise<AuditReportRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_report
     SET loom_url = $2, edited_by = $3, edited_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'borrador'
     RETURNING ${REPORT_COLUMNS}`,
    [id, loomUrl, editedBy]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Aprobación explícita borrador→aprobado (R23). */
export async function approveReport(id: string, approvedBy: string): Promise<AuditReportRow> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_report
     SET status = 'aprobado', approved_by = $2, approved_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'borrador'
     RETURNING ${REPORT_COLUMNS}`,
    [id, approvedBy]
  );
  if (rows.length !== 1) {
    throw new InformeInvalidTransitionError('borrador', 'aprobado');
  }
  return mapRow(rows[0]);
}

/** Guard perezoso de timeout: generando viejo → error (R14). */
export async function expireStaleGeneratingRow(
  id: string,
  timeoutMs: number,
  message: string
): Promise<AuditReportRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_report
     SET status = 'error', error_message = $2, updated_at = now()
     WHERE id = $1 AND status = 'generando'
       AND updated_at < now() - ($3 || ' milliseconds')::interval
     RETURNING ${REPORT_COLUMNS}`,
    [id, message, String(timeoutMs)]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Entrada de historial append-only con seq atómico (R31). Solo INSERT. */
export async function appendEditEntry(input: {
  reportId: string;
  clientDraft: ReportClientDraft;
  changeSummary: string;
  editedBy: string;
}): Promise<AuditReportEditRow> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `INSERT INTO audit_report_edit (report_id, seq, client_draft, change_summary, edited_by)
     SELECT $1, COALESCE(MAX(seq), 0) + 1, $2::jsonb, $3, $4
     FROM audit_report_edit WHERE report_id = $1
     RETURNING id, report_id, seq, client_draft, change_summary, edited_by, edited_at`,
    [input.reportId, input.clientDraft as never, input.changeSummary, input.editedBy]
  );
  const row = rows[0];
  return {
    id: row.id,
    reportId: row.report_id,
    seq: row.seq,
    clientDraft: row.client_draft,
    changeSummary: row.change_summary,
    editedBy: row.edited_by,
    editedAt: row.edited_at
  };
}

/** Marca/desmarca informe aprobado como ejemplar (#17 R10). */
export async function setEjemplar(
  reportId: string,
  value: boolean
): Promise<AuditReportRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_report
     SET ejemplar = $2, updated_at = now()
     WHERE id = $1 AND status = 'aprobado'
     RETURNING ${REPORT_COLUMNS}`,
    [reportId, value]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Informes ejemplares aprobados, más recientes primero (#17 R11). */
export async function listEjemplarReports(limit: number): Promise<
  Array<{
    id: string;
    clientDraft: ReportClientDraft;
    approvedAt: Date | null;
  }>
> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT id, client_draft, approved_at
     FROM audit_report
     WHERE ejemplar = true AND status = 'aprobado' AND client_draft IS NOT NULL
     ORDER BY approved_at DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((row: Record<string, any>) => ({
    id: row.id,
    clientDraft: row.client_draft as ReportClientDraft,
    approvedAt: row.approved_at as Date | null
  }));
}

export async function listEditHistory(reportId: string): Promise<AuditReportEditRow[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT id, report_id, seq, client_draft, change_summary, edited_by, edited_at
     FROM audit_report_edit WHERE report_id = $1 ORDER BY seq ASC`,
    [reportId]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((row: Record<string, any>) => ({
    id: row.id,
    reportId: row.report_id,
    seq: row.seq,
    clientDraft: row.client_draft,
    changeSummary: row.change_summary,
    editedBy: row.edited_by,
    editedAt: row.edited_at
  }));
}
