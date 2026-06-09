import { describe, expect, it } from 'vitest';
import { scoreSectionFromItems } from '../../src/lib/server/scoring/score-section';

describe('section score', () => {
  it('weighted average excludes na and non-scoring items', () => {
    const result = scoreSectionFromItems([
      { itemId: 'a', points: 100, itemWeight: 2, rule: 'a' },
      { itemId: 'b', points: 0, itemWeight: 1, rule: 'b' },
      { itemId: 'c', points: null, itemWeight: 1, rule: 'na' }
    ]);

    expect(result.score).toBe(67);
    expect(result.breakdown).toHaveLength(2);
  });
});
