import { getSql } from '$lib/server/db/client';
import { AuditNotFoundError } from '$lib/server/backoffice/errors';
import { indexToSemaphore } from './semaphore';
import type { Semaphore, TopRisk } from './types';

export type ClosurePreview = {
  client: { razonSocial: string; cuit: string | null };
  indices: {
    it: number | null;
    erp: number | null;
    semaphores: { it: Semaphore | null; erp: Semaphore | null };
  };
  sections: Array<{ code: string; title: string; score: number; semaphore: Semaphore }>;
  topRisks: TopRisk[];
  quickWins: string[];
  nextStep: string | null;
};

export async function buildClosurePreview(auditId: string): Promise<ClosurePreview> {
  const sql = getSql();

  const [audit] = await sql<
    { razon_social: string; cuit: string | null }[]
  >`
    SELECT c.razon_social, c.cuit
    FROM audit a
    JOIN client c ON c.id = a.client_id
    WHERE a.id = ${auditId}
    LIMIT 1
  `;

  if (!audit) {
    throw new AuditNotFoundError();
  }

  const [closure] = await sql<
    {
      indice_it: number | null;
      indice_erp: number | null;
      top_risks: TopRisk[];
      quick_wins: string[];
      next_step: string | null;
    }[]
  >`
    SELECT indice_it, indice_erp, top_risks, quick_wins, next_step
    FROM audit_closure
    WHERE audit_id = ${auditId}
  `;

  const sectionRows = await sql<
    { code: string; title: string; score: number | null }[]
  >`
    SELECT s.code, s.title, ass.score
    FROM audit_section_score ass
    JOIN section s ON s.id = ass.section_id
    WHERE ass.audit_id = ${auditId}
    ORDER BY s.sort_order
  `;

  const indiceIt = closure?.indice_it ?? null;
  const indiceErp = closure?.indice_erp ?? null;

  return {
    client: { razonSocial: audit.razon_social, cuit: audit.cuit },
    indices: {
      it: indiceIt,
      erp: indiceErp,
      semaphores: {
        it: indiceIt !== null ? indexToSemaphore(indiceIt) : null,
        erp: indiceErp !== null ? indexToSemaphore(indiceErp) : null
      }
    },
    sections: sectionRows
      .filter((s) => s.score !== null)
      .map((s) => ({
        code: s.code,
        title: s.title,
        score: s.score!,
        semaphore: indexToSemaphore(s.score!)
      })),
    topRisks: closure?.top_risks ?? [],
    quickWins: closure?.quick_wins ?? [],
    nextStep: closure?.next_step ?? null
  };
}
