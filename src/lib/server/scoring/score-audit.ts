import { TEMPLATE_CODE_TO_INDEX } from './constants';
import { scoreTemplate } from './score-template';
import type {
  AuditResponseRow,
  AuditScoreResult,
  SectionRow,
  TemplateItemRow
} from './types';

export type FrozenTemplate = {
  id: string;
  code: string;
};

export function scoreAudit(
  frozenTemplates: FrozenTemplate[],
  sections: SectionRow[],
  items: TemplateItemRow[],
  responses: AuditResponseRow[],
  referenceDate?: Date
): AuditScoreResult {
  const responseMap = new Map(responses.map((r) => [r.itemId, r]));
  const sectionScoreMap = new Map<string, AuditScoreResult['sectionScores'][number]>();

  let indiceIt: number | null = null;
  let indiceErp: number | null = null;

  for (const template of frozenTemplates) {
    const result = scoreTemplate(template.id, sections, items, responseMap, referenceDate);
    for (const sec of result.sectionScores) {
      sectionScoreMap.set(sec.sectionId, sec);
    }

    const indexKind = TEMPLATE_CODE_TO_INDEX[template.code];
    if (indexKind === 'it') {
      indiceIt = result.score;
    } else if (indexKind === 'erp') {
      indiceErp = result.score;
    }
  }

  const sectionScores = [...sectionScoreMap.values()].sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  return { sectionScores, indiceIt, indiceErp };
}
