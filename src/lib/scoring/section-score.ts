import type { ScoringFieldType } from './types';
import { computeItemScore, type ScoreValue } from './rubric';

export const SCORE_GREEN_MIN = 70;
export const SCORE_AMBER_MIN = 40;

export type ScoreBand = 'green' | 'amber' | 'red' | 'na';

export type SectionScoreResult = {
  score: number | null;
  band: ScoreBand;
  itemContributions: Array<{ itemId: string; contribution: number | null }>;
};

export function scoreToBand(score: number | null): ScoreBand {
  if (score === null) return 'na';
  if (score >= SCORE_GREEN_MIN) return 'green';
  if (score >= SCORE_AMBER_MIN) return 'amber';
  return 'red';
}

export function computeSectionScore(input: {
  items: Array<{ id: string; fieldType: ScoringFieldType; options: unknown; scores: boolean }>;
  responses: Map<string, { value: unknown; na: boolean }>;
}): SectionScoreResult {
  const itemContributions: SectionScoreResult['itemContributions'] = [];
  const contributions: number[] = [];

  for (const item of input.items) {
    if (!item.scores) {
      itemContributions.push({ itemId: item.id, contribution: null });
      continue;
    }

    const resp = input.responses.get(item.id);
    if (!resp || resp.na) {
      itemContributions.push({ itemId: item.id, contribution: null });
      continue;
    }

    const raw = computeItemScore({
      fieldType: item.fieldType,
      options: item.options,
      value: resp.value
    });

    if (raw === null) {
      itemContributions.push({ itemId: item.id, contribution: null });
      continue;
    }

    itemContributions.push({ itemId: item.id, contribution: raw });
    contributions.push(raw);
  }

  if (contributions.length === 0) {
    return { score: null, band: 'na', itemContributions };
  }

  const avg = contributions.reduce((a, b) => a + b, 0) / contributions.length;
  const score = Math.round(avg);
  return { score, band: scoreToBand(score), itemContributions };
}

export type { ScoreValue };
