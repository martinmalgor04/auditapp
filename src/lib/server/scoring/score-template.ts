import { SECTION_WEIGHT_FACTORS } from './constants';
import { isSectionFullyNa, scoreSection } from './score-section';
import type {
  AuditResponseRow,
  AuditScoreResult,
  SectionRow,
  TemplateItemRow
} from './types';

export function scoreTemplate(
  templateId: string,
  sections: SectionRow[],
  items: TemplateItemRow[],
  responses: Map<string, AuditResponseRow>,
  referenceDate?: Date
): { score: number; sectionScores: AuditScoreResult['sectionScores'] } {
  const templateSections = sections.filter((s) => s.templateId === templateId);
  const sectionScores: AuditScoreResult['sectionScores'] = [];

  let weightedSum = 0;
  let factorTotal = 0;

  for (const section of templateSections) {
    if (section.code === 'CAB' || !section.hasScore) {
      continue;
    }

    const sectionItems = items.filter((i) => i.sectionId === section.id);
    if (isSectionFullyNa(sectionItems, responses)) {
      continue;
    }

    const result = scoreSection(sectionItems, responses, referenceDate);
    if (result.breakdown.length === 0) {
      continue;
    }
    sectionScores.push({
      sectionId: section.id,
      code: section.code,
      score: result.score,
      breakdown: result.breakdown
    });

    const factor = SECTION_WEIGHT_FACTORS[section.weight];
    weightedSum += result.score * factor;
    factorTotal += factor;
  }

  const score = factorTotal > 0 ? Math.round(weightedSum / factorTotal) : 0;
  return { score, sectionScores };
}
