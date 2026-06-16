import { getSql } from './client';

export type ProposalReviewStatus = 'pending' | 'accepted' | 'rejected' | 'edited';

/** R19 — marcador de verificación Tier 2. NULL = sin verificar (comportamiento #12). */
export type ProposalVerificationStatus = 'verified' | 'unverified' | null;

export type ReunionProposalRow = {
  id: string;
  reunion_session_id: string;
  item_id: string;
  proposed_value: unknown;
  quote: string;
  confidence: number;
  review_status: ProposalReviewStatus;
  final_value: unknown | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  verification_status: ProposalVerificationStatus;
  created_at: Date;
};

export type ReunionProposalWithItem = ReunionProposalRow & {
  item_label: string;
  item_field_type: string;
  item_options: unknown;
  section_title: string;
};

export async function insertReunionProposals(
  proposals: Array<{
    reunionSessionId: string;
    itemId: string;
    proposedValue: unknown;
    quote: string;
    confidence: number;
    verificationStatus?: ProposalVerificationStatus; // R19; omitido → NULL
  }>
): Promise<void> {
  if (proposals.length === 0) return;
  const sql = getSql();
  for (const p of proposals) {
    await sql`
      INSERT INTO reunion_proposal (
        reunion_session_id, item_id, proposed_value, quote, confidence, verification_status
      )
      VALUES (
        ${p.reunionSessionId},
        ${p.itemId},
        ${sql.json(p.proposedValue as never)},
        ${p.quote},
        ${p.confidence},
        ${p.verificationStatus ?? null}
      )
      ON CONFLICT (reunion_session_id, item_id) DO UPDATE SET
        proposed_value      = EXCLUDED.proposed_value,
        quote               = EXCLUDED.quote,
        confidence          = EXCLUDED.confidence,
        verification_status = EXCLUDED.verification_status,
        review_status       = 'pending',
        final_value         = NULL,
        reviewed_by         = NULL,
        reviewed_at         = NULL
    `;
  }
}

export async function listReunionProposalsBySession(
  reunionSessionId: string
): Promise<ReunionProposalWithItem[]> {
  const sql = getSql();
  return sql<ReunionProposalWithItem[]>`
    SELECT
      rp.id, rp.reunion_session_id, rp.item_id,
      rp.proposed_value, rp.quote, rp.confidence,
      rp.review_status, rp.final_value,
      rp.reviewed_by, rp.reviewed_at, rp.verification_status, rp.created_at,
      ti.label    AS item_label,
      ti.field_type AS item_field_type,
      ti.options  AS item_options,
      s.title     AS section_title
    FROM reunion_proposal rp
    JOIN template_item ti ON ti.id = rp.item_id
    JOIN section s ON s.id = ti.section_id
    WHERE rp.reunion_session_id = ${reunionSessionId}
    ORDER BY rp.created_at ASC
  `;
}

export async function getReunionProposalById(
  proposalId: string
): Promise<ReunionProposalWithItem | null> {
  const sql = getSql();
  const [row] = await sql<ReunionProposalWithItem[]>`
    SELECT
      rp.id, rp.reunion_session_id, rp.item_id,
      rp.proposed_value, rp.quote, rp.confidence,
      rp.review_status, rp.final_value,
      rp.reviewed_by, rp.reviewed_at, rp.verification_status, rp.created_at,
      ti.label    AS item_label,
      ti.field_type AS item_field_type,
      ti.options  AS item_options,
      s.title     AS section_title
    FROM reunion_proposal rp
    JOIN template_item ti ON ti.id = rp.item_id
    JOIN section s ON s.id = ti.section_id
    WHERE rp.id = ${proposalId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function updateReunionProposalReview(input: {
  proposalId: string;
  reviewStatus: ProposalReviewStatus;
  finalValue?: unknown | null;
  reviewedBy: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE reunion_proposal
    SET
      review_status = ${input.reviewStatus},
      final_value   = ${input.finalValue != null ? sql.json(input.finalValue as never) : null},
      reviewed_by   = ${input.reviewedBy},
      reviewed_at   = now()
    WHERE id = ${input.proposalId}
  `;
}

export async function countPendingProposalsByAudit(auditId: string): Promise<number> {
  const sql = getSql();
  const [row] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM reunion_proposal rp
    JOIN reunion_session rs ON rs.id = rp.reunion_session_id
    WHERE rs.audit_id = ${auditId}
      AND rp.review_status = 'pending'
      AND rs.archived_at IS NULL
  `;
  return parseInt(row?.count ?? '0', 10);
}
