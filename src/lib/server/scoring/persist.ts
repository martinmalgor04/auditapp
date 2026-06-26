import { getSql } from '$lib/server/db/client';
import { isValidAuditStatusTransition } from '$lib/server/db/audit-status';
import {
  AuditClosedError,
  AuditNotFoundError,
  ForbiddenError,
  InvalidStateTransitionError
} from '$lib/server/backoffice/errors';
import type { AppUser } from '$lib/server/auth/types';
import { auditMatchesUserScope } from '$lib/server/auth/audit-access';
import { techIsAssigned } from '$lib/server/db/audit-assignment';
import { markReportsStale } from '$lib/server/db/informe-reports';
import { onAuditoriaCerrada } from '$lib/server/email/notify';
import { scoreAudit } from './score-audit';
import { closureFieldsSchema, type ClosureFieldsParsed } from './schemas';
import { ClosureValidationError } from './errors';
import { loadScoringContext } from './load-context';
import type { AuditScoreResult, ClosureFieldsInput } from './types';

export type { AuditScoreResult };

function assertClosureAccess(auditTypes: string[], user: AppUser): void {
  if (user.role !== 'admin' && user.role !== 'tecnico') {
    throw new ForbiddenError();
  }
  if (!auditMatchesUserScope(auditTypes, user)) {
    throw new ForbiddenError();
  }
}

export async function recalculateAndPersistScores(auditId: string): Promise<AuditScoreResult> {
  const ctx = await loadScoringContext(auditId);
  if (!ctx) {
    throw new AuditNotFoundError();
  }

  const referenceDate = ctx.scheduledAt ?? new Date();
  const result = scoreAudit(
    ctx.templates,
    ctx.sections,
    ctx.items,
    ctx.responses,
    referenceDate
  );

  const sql = getSql();

  for (const section of result.sectionScores) {
    await sql`
      INSERT INTO audit_section_score (audit_id, section_id, score, score_breakdown)
      VALUES (
        ${auditId},
        ${section.sectionId},
        ${section.score},
        ${sql.json(section.breakdown as never)}
      )
      ON CONFLICT (audit_id, section_id) DO UPDATE SET
        score = EXCLUDED.score,
        score_breakdown = EXCLUDED.score_breakdown
    `;
  }

  await sql`
    INSERT INTO audit_closure (audit_id, indice_it, indice_erp)
    VALUES (${auditId}, ${result.indiceIt}, ${result.indiceErp})
    ON CONFLICT (audit_id) DO UPDATE SET
      indice_it = EXCLUDED.indice_it,
      indice_erp = EXCLUDED.indice_erp
  `;

  return result;
}

export async function saveClosureFields(
  auditId: string,
  fields: ClosureFieldsInput,
  user: AppUser
): Promise<void> {
  const ctx = await loadScoringContext(auditId);
  if (!ctx) throw new AuditNotFoundError();
  assertClosureAccess(ctx.types, user);

  if (ctx.status === 'cerrada') {
    throw new AuditClosedError();
  }
  if (ctx.status !== 'en_cierre') {
    throw new InvalidStateTransitionError('La auditoría no está en cierre');
  }

  let parsed: ClosureFieldsParsed;
  try {
    parsed = closureFieldsSchema.parse(fields);
  } catch {
    throw new ClosureValidationError();
  }

  const sql = getSql();
  await sql`
    INSERT INTO audit_closure (
      audit_id, top_risks, quick_wins, upsell_findings, next_step
    )
    VALUES (
      ${auditId},
      ${sql.json(parsed.topRisks as never)},
      ${sql.json(parsed.quickWins as never)},
      ${sql.json(parsed.upsellFindings as never)},
      ${parsed.nextStep}
    )
    ON CONFLICT (audit_id) DO UPDATE SET
      top_risks = EXCLUDED.top_risks,
      quick_wins = EXCLUDED.quick_wins,
      upsell_findings = EXCLUDED.upsell_findings,
      next_step = EXCLUDED.next_step
  `;

  if (parsed.sectionObservations) {
    for (const [sectionId, observations] of Object.entries(parsed.sectionObservations)) {
      await sql`
        INSERT INTO audit_section_score (audit_id, section_id, observations)
        VALUES (${auditId}, ${sectionId}, ${observations})
        ON CONFLICT (audit_id, section_id) DO UPDATE SET
          observations = EXCLUDED.observations
      `;
    }
  }
}

export type ConfirmClosureResult = {
  warnings: string[];
};

export async function confirmClosure(
  auditId: string,
  user: AppUser
): Promise<ConfirmClosureResult> {
  const ctx = await loadScoringContext(auditId);
  if (!ctx) throw new AuditNotFoundError();
  assertClosureAccess(ctx.types, user);

  if (ctx.status !== 'en_cierre') {
    throw new InvalidStateTransitionError('Solo se puede confirmar desde en_cierre');
  }

  const sql = getSql();
  const [closure] = await sql<
    { top_risks: unknown[]; quick_wins: unknown[]; next_step: string | null }[]
  >`
    SELECT top_risks, quick_wins, next_step FROM audit_closure WHERE audit_id = ${auditId}
  `;

  const warnings: string[] = [];
  if (!closure || (Array.isArray(closure.top_risks) && closure.top_risks.length === 0)) {
    warnings.push('top_risks');
  }
  if (!closure || (Array.isArray(closure.quick_wins) && closure.quick_wins.length === 0)) {
    warnings.push('quick_wins');
  }
  if (!closure?.next_step?.trim()) {
    warnings.push('next_step');
  }

  if (!isValidAuditStatusTransition('en_cierre', 'cerrada')) {
    throw new InvalidStateTransitionError();
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE audit
      SET status = 'cerrada', public_token = NULL, closed_at = now()
      WHERE id = ${auditId}
    `;
    await tx`
      UPDATE audit_closure
      SET closed_at = now(), closed_by = ${user.id}
      WHERE audit_id = ${auditId}
    `;
  });

  void onAuditoriaCerrada(auditId);

  return { warnings };
}

export async function reopenAudit(auditId: string, user: AppUser): Promise<void> {
  if (user.role !== 'admin' && user.role !== 'tecnico') {
    throw new ForbiddenError();
  }

  if (user.role === 'tecnico') {
    const assigned = await techIsAssigned(auditId, user.id);
    if (!assigned) {
      throw new ForbiddenError('Solo el técnico asignado puede reabrir la auditoría');
    }
  }

  const ctx = await loadScoringContext(auditId);
  if (!ctx) throw new AuditNotFoundError();

  if (ctx.status !== 'cerrada') {
    throw new InvalidStateTransitionError('Solo se puede reabrir una auditoría cerrada');
  }

  const isAllowed = isValidAuditStatusTransition('cerrada', 'en_cierre', {
    allowAdminReopen: user.role === 'admin',
    allowTechReopen: user.role === 'tecnico'
  });
  if (!isAllowed) {
    throw new InvalidStateTransitionError('Transición no permitida');
  }

  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`UPDATE audit SET status = 'en_cierre', closed_at = NULL WHERE id = ${auditId}`;
    await tx`
      UPDATE audit_closure
      SET closed_at = NULL, closed_by = NULL
      WHERE audit_id = ${auditId}
    `;
    await markReportsStale(auditId, tx);
  });
}
