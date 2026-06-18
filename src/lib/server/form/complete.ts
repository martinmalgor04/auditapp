import type { AppUser } from '$lib/server/auth/types';
import {
  getAuditFormHeader,
  listPendingRequiredItems,
  setAuditStatus,
  stampFinishedAt
} from '$lib/server/db/audit-form';
import { recalculateAndPersistScores } from '$lib/server/scoring/persist';
import { AuditFormNotAllowedError, AuditFormNotEditableError } from './errors';
import { assertFormAccess } from './load-form';

export type CompleteRelevamientoResult = {
  status: 'en_cierre';
  warnings: Array<{ id: string; label: string }>;
};

export async function completeRelevamiento(
  auditId: string,
  user: AppUser
): Promise<CompleteRelevamientoResult> {
  const header = await getAuditFormHeader(auditId);
  if (!header) {
    throw new AuditFormNotAllowedError('Auditoría no encontrada');
  }

  assertFormAccess(header, user);

  if (header.status === 'en_cierre') {
    return { status: 'en_cierre', warnings: [] };
  }

  const pending = await listPendingRequiredItems(auditId);
  // Sella finished_at si aún es NULL (R5, R7). Patrón atómico: solo actúa si es NULL.
  await stampFinishedAt(auditId);
  await setAuditStatus(auditId, 'en_cierre');
  await recalculateAndPersistScores(auditId);

  return {
    status: 'en_cierre',
    warnings: pending
  };
}

export { AuditFormNotEditableError, AuditFormNotAllowedError };
