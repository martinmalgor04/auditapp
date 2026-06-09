import { scoreItem } from './score-item';
import type {
  AuditResponseRow,
  ScoreBreakdownEntry,
  ScoreItemInput,
  SectionScoreResult,
  TemplateItemRow
} from './types';

export function scoreSectionFromItems(
  items: Array<{ itemId: string; points: 0 | 50 | 100 | null; itemWeight: number; rule: string }>
): SectionScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const item of items) {
    if (item.points === null) continue;
    const weight = item.itemWeight > 0 ? item.itemWeight : 1;
    breakdown.push({
      itemId: item.itemId,
      points: item.points,
      weight,
      rule: item.rule
    });
    weightedSum += item.points * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) {
    return { score: 0, breakdown: [] };
  }

  const score = Math.round(weightedSum / weightTotal);
  return { score: Math.min(100, Math.max(0, score)), breakdown };
}

export function scoreSection(
  sectionItems: TemplateItemRow[],
  responses: Map<string, AuditResponseRow>,
  referenceDate?: Date
): SectionScoreResult {
  const scored: Array<{
    itemId: string;
    points: 0 | 50 | 100 | null;
    itemWeight: number;
    rule: string;
  }> = [];

  for (const item of sectionItems) {
    const resp = responses.get(item.id);
    const input: ScoreItemInput = {
      fieldType: item.fieldType,
      options: item.options,
      value: resp?.value ?? null,
      na: resp?.na ?? false,
      scores: item.scores,
      required: item.required,
      itemWeight: item.itemWeight,
      referenceDate
    };
    const result = scoreItem(input);
    scored.push({
      itemId: item.id,
      points: result.points,
      itemWeight: item.itemWeight,
      rule: result.rule
    });
  }

  return scoreSectionFromItems(scored);
}

export function isSectionFullyNa(
  sectionItems: TemplateItemRow[],
  responses: Map<string, AuditResponseRow>
): boolean {
  const scoringItems = sectionItems.filter((i) => i.scores);
  if (scoringItems.length === 0) return false;
  return scoringItems.every((item) => responses.get(item.id)?.na === true);
}
