import { getSql } from './client';
import type { PsysProposalPayload } from '$lib/server/psys/schemas';

export type AuditProposalLinkRow = {
  id: string;
  auditId: string;
  reportId: string;
  status: 'activo' | 'error';
  proposalId: string | null;
  numberDisplay: string | null;
  proposalUrl: string | null;
  psysStatus: string | null;
  contractVersion: string;
  sentPayload: PsysProposalPayload | Record<string, unknown>;
  errorMessage: string | null;
  createdBy: string;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reportVersion?: number;
};

const LINK_SELECT = `
  l.id, l.audit_id, l.report_id, l.status, l.proposal_id, l.number_display,
  l.proposal_url, l.psys_status, l.contract_version, l.sent_payload,
  l.error_message, l.created_by, l.synced_at, l.created_at, l.updated_at
`;

const LINK_RETURNING = `
  id, audit_id, report_id, status, proposal_id, number_display,
  proposal_url, psys_status, contract_version, sent_payload,
  error_message, created_by, synced_at, created_at, updated_at
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>, reportVersion?: number): AuditProposalLinkRow {
  return {
    id: row.id,
    auditId: row.audit_id,
    reportId: row.report_id,
    status: row.status,
    proposalId: row.proposal_id,
    numberDisplay: row.number_display,
    proposalUrl: row.proposal_url,
    psysStatus: row.psys_status,
    contractVersion: row.contract_version,
    sentPayload: row.sent_payload,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(reportVersion !== undefined ? { reportVersion } : {})
  };
}

export async function findActiveLinkByAuditReport(
  auditId: string,
  reportId: string
): Promise<AuditProposalLinkRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT ${LINK_SELECT}
     FROM audit_proposal_link l
     WHERE l.audit_id = $1 AND l.report_id = $2 AND l.status = 'activo'
     LIMIT 1`,
    [auditId, reportId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findLatestActiveLinkByAudit(
  auditId: string
): Promise<AuditProposalLinkRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT ${LINK_SELECT}, r.version AS report_version
     FROM audit_proposal_link l
     JOIN audit_report r ON r.id = l.report_id
     WHERE l.audit_id = $1 AND l.status = 'activo'
     ORDER BY l.created_at DESC
     LIMIT 1`,
    [auditId]
  );
  return rows[0] ? mapRow(rows[0], rows[0].report_version) : null;
}

export async function insertActiveProposalLink(input: {
  auditId: string;
  reportId: string;
  proposalId: string;
  numberDisplay: string | null;
  proposalUrl: string;
  psysStatus: string;
  contractVersion: string;
  sentPayload: PsysProposalPayload;
  createdBy: string;
}): Promise<AuditProposalLinkRow> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `INSERT INTO audit_proposal_link (
       audit_id, report_id, status, proposal_id, number_display, proposal_url,
       psys_status, contract_version, sent_payload, created_by
     )
     VALUES ($1, $2, 'activo', $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING ${LINK_RETURNING}`,
    [
      input.auditId,
      input.reportId,
      input.proposalId,
      input.numberDisplay,
      input.proposalUrl,
      input.psysStatus,
      input.contractVersion,
      input.sentPayload as never,
      input.createdBy
    ]
  );
  return mapRow(rows[0]);
}

export async function insertErrorProposalLink(input: {
  auditId: string;
  reportId: string;
  contractVersion: string;
  sentPayload: PsysProposalPayload;
  errorMessage: string;
  createdBy: string;
}): Promise<AuditProposalLinkRow> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `INSERT INTO audit_proposal_link (
       audit_id, report_id, status, contract_version, sent_payload, error_message, created_by
     )
     VALUES ($1, $2, 'error', $3, $4::jsonb, $5, $6)
     RETURNING ${LINK_RETURNING}`,
    [
      input.auditId,
      input.reportId,
      input.contractVersion,
      input.sentPayload as never,
      input.errorMessage,
      input.createdBy
    ]
  );
  return mapRow(rows[0]);
}

export async function updateProposalLinkSync(input: {
  id: string;
  psysStatus: string;
}): Promise<AuditProposalLinkRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_proposal_link
     SET psys_status = $2, synced_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'activo'
     RETURNING ${LINK_RETURNING}`,
    [input.id, input.psysStatus]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}

export function toProposalLinkView(row: AuditProposalLinkRow) {
  return {
    link_id: row.id,
    proposal_id: row.proposalId,
    number_display: row.numberDisplay,
    proposal_url: row.proposalUrl,
    psys_status: row.psysStatus,
    report_id: row.reportId,
    report_version: row.reportVersion ?? null,
    synced_at: row.syncedAt ? row.syncedAt.toISOString() : null,
    created_at: row.createdAt.toISOString()
  };
}
