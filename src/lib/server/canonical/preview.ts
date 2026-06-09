import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import type { Semaphore } from '$lib/server/scoring/types';
import type { CanonicalAudit } from './schema';

export type ReportPreview = {
  client: { razonSocial: string; cuit: string | null };
  indices: { it?: number; erp?: number };
  semaphore: { it?: Semaphore; erp?: Semaphore };
  topRisks: CanonicalAudit['top_risks'];
  quickWins: string[];
  upsellFindings: CanonicalAudit['upsell_findings'];
  nextStep: string | null;
  sectionsSummary: Array<{ code: string; title: string; score: number | null }>;
  /** Secciones con score para preview informe (solo scored). */
  sections: Array<{ code: string; title: string; score: number; semaphore: Semaphore }>;
};

export type BuildReportPreviewOptions = {
  /** Incluir upsell interno (vista cierre). Default true. */
  includeUpsell?: boolean;
};

export function buildReportPreview(
  canonical: CanonicalAudit,
  options: BuildReportPreviewOptions = {}
): ReportPreview {
  const { includeUpsell = true } = options;
  const { it, erp } = canonical.indices;

  const sectionsSummary = canonical.sections.map((s) => ({
    code: s.code,
    title: s.title,
    score: s.score
  }));

  const sections = canonical.sections
    .filter((s): s is typeof s & { score: number } => s.score !== null)
    .map((s) => ({
      code: s.code,
      title: s.title,
      score: s.score,
      semaphore: indexToSemaphore(s.score)
    }));

  return {
    client: {
      razonSocial: canonical.client.razon_social,
      cuit: canonical.client.cuit
    },
    indices: {
      ...(it !== undefined ? { it } : {}),
      ...(erp !== undefined ? { erp } : {})
    },
    semaphore: {
      ...(it !== undefined ? { it: indexToSemaphore(it) } : {}),
      ...(erp !== undefined ? { erp: indexToSemaphore(erp) } : {})
    },
    topRisks: canonical.top_risks,
    quickWins: canonical.quick_wins,
    upsellFindings: includeUpsell ? canonical.upsell_findings : [],
    nextStep: canonical.next_step,
    sectionsSummary,
    sections
  };
}

export function stripInternalFindings(canonical: CanonicalAudit): CanonicalAudit {
  return {
    ...canonical,
    upsell_findings: canonical.upsell_findings.filter((f) => !f.internal)
  };
}

/** Preview legible para cliente: sin upsell interno. */
export function buildClientReportPreview(canonical: CanonicalAudit): ReportPreview {
  return buildReportPreview(stripInternalFindings(canonical), { includeUpsell: false });
}
