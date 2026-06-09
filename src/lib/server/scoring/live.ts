import { AuditNotFoundError } from '$lib/server/backoffice/errors';
import { scoreAudit } from './score-audit';
import { loadScoringContext } from './load-context';
import type { AuditScoreResult } from './types';

/** Misma lógica que scoreAudit; no escribe DB. */
export async function computeLiveScores(auditId: string): Promise<AuditScoreResult> {
  const ctx = await loadScoringContext(auditId);
  if (!ctx) {
    throw new AuditNotFoundError();
  }

  const referenceDate = ctx.scheduledAt ?? new Date();
  return scoreAudit(
    ctx.templates,
    ctx.sections,
    ctx.items,
    ctx.responses,
    referenceDate
  );
}
