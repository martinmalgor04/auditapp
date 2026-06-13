import type { ReportClientDraft } from '../schemas';
import type { ContextConfig } from '../context/config';
import type { FewshotExample } from '../context/schemas';
import { estimateTokens, trimToBudget } from '../context/tokens';

export type FewshotDeps = {
  listEjemplarReports: (limit: number) => Promise<
    Array<{
      id: string;
      clientDraft: ReportClientDraft;
      approvedAt: Date | null;
    }>
  >;
};

function extractClientDraftExcerpt(draft: ReportClientDraft): string {
  const riesgos = draft.riesgos.items
    .slice(0, 3)
    .map((r) => `- ${r.titulo}: ${r.descripcion}`)
    .join('\n');
  const etapas = draft.plan.etapas
    .slice(0, 4)
    .map((e) => `- ${e.semana}: ${e.titulo}`)
    .join('\n');
  return [
    `Resumen: ${draft.resumen.diagnostico}. ${draft.resumen.lead}`,
    `Riesgos:\n${riesgos}`,
    `Plan:\n${etapas}`
  ].join('\n\n');
}

/** Informes ejemplares aprobados más recientes, recortados al presupuesto (R11). */
export async function selectFewshotExamples(
  deps: FewshotDeps,
  config: ContextConfig
): Promise<FewshotExample[]> {
  const rows = await deps.listEjemplarReports(config.fewshot.maxExamples);
  const examples: FewshotExample[] = rows.map((row) => ({
    reportId: row.id,
    text: extractClientDraftExcerpt(row.clientDraft)
  }));

  const { kept } = trimToBudget(
    examples,
    (ex) => ex.text,
    config.fewshot.maxTokens
  );
  return kept;
}

export function formatFewshotBlock(examples: FewshotExample[]): string {
  return examples
    .map((ex, i) => `### Ejemplo ${i + 1}\n${ex.text}`)
    .join('\n\n');
}

export function fewshotTokens(examples: FewshotExample[]): number {
  return estimateTokens(formatFewshotBlock(examples));
}
