import { getSql } from '$lib/server/db/client';
import type { AppUser } from '$lib/server/auth/types';
import { auditMatchesUserScope } from '$lib/server/auth/audit-access';
import {
  AuditClosedError,
  AuditNotFoundError,
  ForbiddenError
} from '$lib/server/backoffice/errors';
import { buildCanonicalAuditJson } from '$lib/server/canonical/build';
import { buildReportPreview } from '$lib/server/canonical/preview';
import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import type { Semaphore, TopRisk } from '$lib/server/scoring/types';

export type ClosureSectionView = {
  id: string;
  code: string;
  title: string;
  score: number | null;
  semaphore: Semaphore | null;
  observations: string | null;
};

export type ClosureLoadResult = {
  audit: {
    id: string;
    razonSocial: string;
    status: string;
    types: string[];
  };
  indices: {
    it: number | null;
    erp: number | null;
    itSemaphore: Semaphore | null;
    erpSemaphore: Semaphore | null;
  };
  sections: ClosureSectionView[];
  topRisks: TopRisk[];
  quickWins: string[];
  upsellFindings: string[];
  nextStep: string | null;
  readonly: boolean;
  isAdmin: boolean;
};

function assertClosurePageAccess(auditTypes: string[], status: string, user: AppUser): void {
  if (user.role !== 'admin' && user.role !== 'tecnico') {
    throw new ForbiddenError();
  }
  if (!auditMatchesUserScope(auditTypes, user)) {
    throw new ForbiddenError();
  }
  if (status !== 'en_cierre' && status !== 'cerrada') {
    throw new ForbiddenError('La auditoría no está en cierre');
  }
}

export async function loadClosurePage(auditId: string, user: AppUser): Promise<ClosureLoadResult> {
  const sql = getSql();

  const [audit] = await sql<
    {
      id: string;
      razon_social: string;
      status: string;
      types: string[];
      assigned_tech_id: string | null;
    }[]
  >`
    SELECT a.id, c.razon_social, a.status, a.types, a.assigned_tech_id
    FROM audit a
    JOIN client c ON c.id = a.empresa_id
    WHERE a.id = ${auditId}
      AND a.archived_at IS NULL
    LIMIT 1
  `;

  if (!audit) {
    throw new AuditNotFoundError();
  }

  assertClosurePageAccess(audit.types, audit.status, user);

  const canonical = await buildCanonicalAuditJson(auditId);
  const preview = buildReportPreview(canonical);

  const sectionRows = await sql<
    {
      section_id: string;
      code: string;
      title: string;
      score: number | null;
      observations: string | null;
    }[]
  >`
    SELECT ass.section_id, s.code, s.title, ass.score, ass.observations
    FROM audit_section_score ass
    JOIN section s ON s.id = ass.section_id
    WHERE ass.audit_id = ${auditId}
      AND s.code != 'CAB'
    ORDER BY s.sort_order
  `;

  const indiceIt = preview.indices.it ?? null;
  const indiceErp = preview.indices.erp ?? null;
  const readonly = audit.status === 'cerrada';

  return {
    audit: {
      id: audit.id,
      razonSocial: audit.razon_social,
      status: audit.status,
      types: audit.types
    },
    indices: {
      it: indiceIt,
      erp: indiceErp,
      itSemaphore: indiceIt !== null ? indexToSemaphore(indiceIt) : null,
      erpSemaphore: indiceErp !== null ? indexToSemaphore(indiceErp) : null
    },
    sections: sectionRows.map((s) => ({
      id: s.section_id,
      code: s.code,
      title: s.title,
      score: s.score,
      semaphore: s.score !== null ? indexToSemaphore(s.score) : null,
      observations: s.observations
    })),
    topRisks: preview.topRisks,
    quickWins: preview.quickWins,
    upsellFindings: preview.upsellFindings.map((f) => f.text),
    nextStep: preview.nextStep,
    readonly,
    isAdmin: user.role === 'admin'
  };
}

export { AuditClosedError, AuditNotFoundError, ForbiddenError };
