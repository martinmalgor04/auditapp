import { getSql } from '$lib/server/db/client';
import {
  getReunionProposalById,
  updateReunionProposalReview
} from '$lib/server/db/reunion-proposals';
import { parseFormValue } from '$lib/server/form/schemas';
import type { FieldType } from '$lib/server/db/field-schemas';
import {
  ReunionProposalNotFoundError,
  ReunionProposalValidationError
} from './errors';

/**
 * Verifica que la propuesta pertenezca a la auditoría y que el usuario tenga acceso.
 * Retorna la propuesta si todo OK, lanza error si no.
 */
async function getProposalForReview(proposalId: string, auditId: string) {
  const proposal = await getReunionProposalById(proposalId);
  if (!proposal) {
    throw new ReunionProposalNotFoundError();
  }

  // Verificar que la sesión sea de esta auditoría
  const sql = getSql();
  const [session] = await sql<{ audit_id: string }[]>`
    SELECT audit_id FROM reunion_session WHERE id = ${proposal.reunion_session_id} LIMIT 1
  `;
  if (!session || session.audit_id !== auditId) {
    throw new ReunionProposalNotFoundError();
  }

  return proposal;
}

/**
 * Hace upsert en audit_response con source='reunion_ia'.
 */
async function upsertReunionResponse(
  auditId: string,
  itemId: string,
  value: unknown,
  userId: string
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO audit_response (audit_id, item_id, value, na, source, updated_by)
    VALUES (
      ${auditId},
      ${itemId},
      ${sql.json(value as never)},
      false,
      'reunion_ia',
      ${userId}
    )
    ON CONFLICT (audit_id, item_id) DO UPDATE SET
      value      = EXCLUDED.value,
      na         = false,
      source     = 'reunion_ia',
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  `;
}

/** Acepta una propuesta y persiste en audit_response (R16). */
export async function acceptProposal(
  proposalId: string,
  auditId: string,
  userId: string
): Promise<void> {
  const proposal = await getProposalForReview(proposalId, auditId);

  const value =
    proposal.final_value !== null && proposal.final_value !== undefined
      ? proposal.final_value
      : proposal.proposed_value;

  await upsertReunionResponse(auditId, proposal.item_id, value, userId);

  await updateReunionProposalReview({
    proposalId,
    reviewStatus: 'accepted',
    reviewedBy: userId
  });
}

/** Rechaza una propuesta sin modificar audit_response (R17). */
export async function rejectProposal(
  proposalId: string,
  auditId: string,
  userId: string
): Promise<void> {
  await getProposalForReview(proposalId, auditId);

  await updateReunionProposalReview({
    proposalId,
    reviewStatus: 'rejected',
    reviewedBy: userId
  });
}

/** Edita el valor propuesto, valida y acepta (R18). */
export async function editAndAcceptProposal(
  proposalId: string,
  auditId: string,
  finalValue: unknown,
  userId: string
): Promise<void> {
  const proposal = await getProposalForReview(proposalId, auditId);

  // Validar final_value con el mismo parser que el form técnico
  let validValue: unknown;
  try {
    validValue = parseFormValue(
      proposal.item_field_type as FieldType,
      proposal.item_options,
      finalValue,
      false
    );
  } catch {
    throw new ReunionProposalValidationError(
      `Valor inválido para campo ${proposal.item_field_type}`
    );
  }

  await upsertReunionResponse(auditId, proposal.item_id, validValue, userId);

  await updateReunionProposalReview({
    proposalId,
    reviewStatus: 'edited',
    finalValue: validValue,
    reviewedBy: userId
  });
}
