import { describe, expect, it } from 'vitest';
import { scoreItem } from '../../src/lib/server/scoring/score-item';

describe('item score', () => {
  it('maps each field_type and rubric to 0|50|100', () => {
    expect(scoreItem({ fieldType: 'bool', options: {}, value: true, na: false, scores: true, required: false, itemWeight: 1 })).toEqual({
      points: 100,
      rule: 'bool:true→100'
    });
    expect(scoreItem({ fieldType: 'bool', options: {}, value: false, na: false, scores: true, required: false, itemWeight: 1 })).toEqual({
      points: 0,
      rule: 'bool:false→0'
    });

    expect(scoreItem({ fieldType: 'tri', options: {}, value: 'si', na: false, scores: true, required: false, itemWeight: 1 }).points).toBe(100);
    expect(scoreItem({ fieldType: 'tri', options: {}, value: 'parcial', na: false, scores: true, required: false, itemWeight: 1 }).points).toBe(50);
    expect(scoreItem({ fieldType: 'tri', options: {}, value: 'no', na: false, scores: true, required: false, itemWeight: 1 }).points).toBe(0);

    expect(
      scoreItem({
        fieldType: 'select',
        options: { score_map: { A: 100, B: 50, C: 0 } },
        value: 'B',
        na: false,
        scores: true,
        required: false,
        itemWeight: 1
      }).points
    ).toBe(50);

    expect(
      scoreItem({
        fieldType: 'number',
        options: { thresholds: [{ min: 0, max: 49, score: 0 }, { min: 50, max: 79, score: 50 }, { min: 80, max: 100, score: 100 }] },
        value: 85,
        na: false,
        scores: true,
        required: false,
        itemWeight: 1
      }).points
    ).toBe(100);

    expect(
      scoreItem({
        fieldType: 'text',
        options: {},
        value: null,
        na: false,
        scores: false,
        required: true,
        itemWeight: 1
      }).points
    ).toBe(0);
  });
});
