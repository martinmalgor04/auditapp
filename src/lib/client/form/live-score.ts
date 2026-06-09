import { computeSectionScore, scoreToBand, type ScoreBand } from '$lib/scoring/section-score';
import type { FieldType } from '$lib/server/db/field-schemas';

export type LiveScoreSection = {
  sectionId: string;
  score: number | null;
  band: ScoreBand;
};

export function computeLiveSectionScore(input: {
  sectionId: string;
  items: Array<{ id: string; fieldType: FieldType; options: unknown; scores: boolean }>;
  responses: Map<string, { value: unknown; na: boolean }>;
}): LiveScoreSection {
  const result = computeSectionScore({
    items: input.items,
    responses: input.responses
  });
  return {
    sectionId: input.sectionId,
    score: result.score,
    band: result.band
  };
}

export function updateScoreFromApi(
  scores: Map<string, LiveScoreSection>,
  sectionId: string,
  score: number | null,
  band: string
): Map<string, LiveScoreSection> {
  const next = new Map(scores);
  next.set(sectionId, {
    sectionId,
    score,
    band: (band as ScoreBand) ?? scoreToBand(score)
  });
  return next;
}

export { computeSectionScore, scoreToBand };
