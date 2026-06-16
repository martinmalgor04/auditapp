import { afterEach, describe, it, expect } from 'vitest';
import { dropBelowThreshold, type GuardableProposal } from '../src/lib/server/reunion/pipeline/grounding';
import { readAnalyzeConfig } from '../src/lib/server/reunion/pipeline/analyze';

function prop(confidence: number, item_id = 'i'): GuardableProposal {
  return { item_id, proposed_value: 'x', quote: 'q', confidence };
}

describe('threshold — dropBelowThreshold (R10)', () => {
  it('default 0.5: 0.49 fuera, 0.5 dentro', () => {
    const { kept, dropped } = dropBelowThreshold([prop(0.49, 'lo'), prop(0.5, 'hi')], 0.5);
    expect(kept.map((p) => p.item_id)).toEqual(['hi']);
    expect(dropped.map((p) => p.item_id)).toEqual(['lo']);
  });

  it('umbral 0.8: 0.7 fuera, 0.8 dentro', () => {
    const { kept } = dropBelowThreshold([prop(0.7, 'lo'), prop(0.8, 'hi')], 0.8);
    expect(kept.map((p) => p.item_id)).toEqual(['hi']);
  });
});

describe('threshold — readAnalyzeConfig lee REUNION_CONFIDENCE_MIN (R10)', () => {
  afterEach(() => {
    delete process.env.REUNION_CONFIDENCE_MIN;
  });

  it('default 0.5 cuando no está definida', () => {
    delete process.env.REUNION_CONFIDENCE_MIN;
    expect(readAnalyzeConfig().confidenceMin).toBe(0.5);
  });

  it('toma el valor de env cuando es válido', () => {
    process.env.REUNION_CONFIDENCE_MIN = '0.8';
    expect(readAnalyzeConfig().confidenceMin).toBe(0.8);
  });

  it('valor inválido (fuera de [0,1]) cae al default 0.5', () => {
    process.env.REUNION_CONFIDENCE_MIN = '2';
    expect(readAnalyzeConfig().confidenceMin).toBe(0.5);
  });
});
