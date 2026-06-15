import { getSql } from './client';

export type ReunionSessionStatus =
  | 'draft'
  | 'uploading'
  | 'processing'
  | 'ready_for_review'
  | 'reviewed'
  | 'error';

export type ReunionSessionType = 'kickoff' | 'visita' | 'otro';

export type ReunionSessionRow = {
  id: string;
  audit_id: string;
  attachment_id: string | null;
  started_by: string;
  session_type: ReunionSessionType;
  consent_recorded_at: Date;
  consent_note: string | null;
  status: ReunionSessionStatus;
  error_message: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ReunionSessionWithUser = ReunionSessionRow & {
  started_by_name: string;
};

export async function insertReunionSession(input: {
  auditId: string;
  startedBy: string;
  sessionType: ReunionSessionType;
  consentRecordedAt: Date;
  consentNote?: string | null;
}): Promise<string> {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO reunion_session (
      audit_id, started_by, session_type, consent_recorded_at, consent_note, status
    )
    VALUES (
      ${input.auditId},
      ${input.startedBy},
      ${input.sessionType},
      ${input.consentRecordedAt},
      ${input.consentNote ?? null},
      'draft'
    )
    RETURNING id
  `;
  return row.id;
}

export async function getReunionSessionById(
  sessionId: string
): Promise<ReunionSessionWithUser | null> {
  const sql = getSql();
  const [row] = await sql<ReunionSessionWithUser[]>`
    SELECT
      rs.id, rs.audit_id, rs.attachment_id, rs.started_by,
      rs.session_type, rs.consent_recorded_at, rs.consent_note,
      rs.status, rs.error_message, rs.archived_at,
      rs.created_at, rs.updated_at,
      au.name AS started_by_name
    FROM reunion_session rs
    JOIN app_user au ON au.id = rs.started_by
    WHERE rs.id = ${sessionId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function listReunionSessionsByAudit(
  auditId: string
): Promise<ReunionSessionWithUser[]> {
  const sql = getSql();
  return sql<ReunionSessionWithUser[]>`
    SELECT
      rs.id, rs.audit_id, rs.attachment_id, rs.started_by,
      rs.session_type, rs.consent_recorded_at, rs.consent_note,
      rs.status, rs.error_message, rs.archived_at,
      rs.created_at, rs.updated_at,
      au.name AS started_by_name
    FROM reunion_session rs
    JOIN app_user au ON au.id = rs.started_by
    WHERE rs.audit_id = ${auditId}
    ORDER BY rs.created_at DESC
  `;
}

export async function updateReunionSessionStatus(
  sessionId: string,
  status: ReunionSessionStatus,
  errorMessage?: string | null
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE reunion_session
    SET status = ${status},
        error_message = ${errorMessage ?? null},
        updated_at = now()
    WHERE id = ${sessionId}
  `;
}

export async function setReunionSessionAttachment(
  sessionId: string,
  attachmentId: string,
  status: ReunionSessionStatus = 'processing'
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE reunion_session
    SET attachment_id = ${attachmentId},
        status = ${status},
        updated_at = now()
    WHERE id = ${sessionId}
  `;
}

export async function archiveReunionSession(sessionId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE reunion_session
    SET archived_at = now(), updated_at = now()
    WHERE id = ${sessionId}
  `;
}

export async function listExpiredReunionSessions(
  retentionDays: number
): Promise<ReunionSessionRow[]> {
  const sql = getSql();
  return sql<ReunionSessionRow[]>`
    SELECT
      id, audit_id, attachment_id, started_by, session_type,
      consent_recorded_at, consent_note, status, error_message,
      archived_at, created_at, updated_at
    FROM reunion_session
    WHERE archived_at IS NULL
      AND created_at < now() - (${retentionDays} || ' days')::interval
      AND status IN ('ready_for_review', 'reviewed', 'error')
  `;
}
