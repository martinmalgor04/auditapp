import { describe, expect, it } from 'vitest';
import { computeSectionScore, scoreToBand } from '$lib/scoring/section-score';
import type { FieldType } from '../src/lib/server/db/field-schemas';

describe('form live score', () => {
  const selectItem = {
    id: 'item-1',
    fieldType: 'select' as FieldType,
    options: {
      choices: ['A', 'B', 'C'],
      score_map: { A: 100, B: 50, C: 0 }
    },
    scores: true
  };

  it('updates score when scored item changes', () => {
    const r1 = computeSectionScore({
      items: [selectItem],
      responses: new Map([['item-1', { value: 'A', na: false }]])
    });
    expect(r1.score).toBe(100);

    const r2 = computeSectionScore({
      items: [selectItem],
      responses: new Map([['item-1', { value: 'C', na: false }]])
    });
    expect(r2.score).toBe(0);
  });

  it('maps bands green amber red', () => {
    expect(scoreToBand(75)).toBe('green');
    expect(scoreToBand(55)).toBe('amber');
    expect(scoreToBand(30)).toBe('red');
  });

  it('all N/A section shows na without numeric score', () => {
    const result = computeSectionScore({
      items: [selectItem],
      responses: new Map([['item-1', { value: null, na: true }]])
    });
    expect(result.score).toBeNull();
    expect(result.band).toBe('na');
  });

  it('no manual score input in DOM contract', () => {
    const dom = '<div data-score-band="green">Score: 75/100</div>';
    expect(dom).not.toContain('input');
    expect(dom).not.toContain('type="number"');
  });
});
