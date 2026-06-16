import { describe, it, expect, vi } from 'vitest';
import { verifyProposals } from '../src/lib/server/reunion/pipeline/verify';
import {
  analyzeProposalsWith,
  type AnalyzeConfig,
  type AnalyzedProposal,
  type AnthropicMessage
} from '../src/lib/server/reunion/pipeline/analyze';
import type { TemplateContext } from '../src/lib/server/reunion/pipeline/context';

const ITEM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ITEM_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const CONTEXT: TemplateContext = {
  items: [
    { item_id: ITEM_A, label: 'A', section_title: 'S', help_text: null, field_type: 'text', options: null, filled_by: 'cliente', current_value: null },
    { item_id: ITEM_B, label: 'B', section_title: 'S', help_text: null, field_type: 'text', options: null, filled_by: 'cliente', current_value: null },
    { item_id: ITEM_C, label: 'C', section_title: 'S', help_text: null, field_type: 'text', options: null, filled_by: 'cliente', current_value: null }
  ]
};

const CONFIG: AnalyzeConfig = {
  model: 'claude-sonnet-4-6',
  confidenceMin: 0.5,
  verifierEnabled: true,
  verifierModel: 'claude-haiku-4-5'
};

function judgeResponse(supported: boolean): AnthropicMessage {
  return { content: [{ type: 'tool_use', name: 'judge', input: { supported, reason: 'r' } }] };
}

function survivors(): AnalyzedProposal[] {
  return [
    { item_id: ITEM_A, proposed_value: 'va', quote: 'qa', confidence: 0.9 },
    { item_id: ITEM_B, proposed_value: 'vb', quote: 'qb', confidence: 0.9 },
    { item_id: ITEM_C, proposed_value: 'vc', quote: 'qc', confidence: 0.9 }
  ];
}

describe('verifier — verifyProposals (R12, R19)', () => {
  it('supported=false descarta; supported=true sobrevive con verified; error → conservar unverified', async () => {
    const transport = vi.fn(async (body: any) => {
      // El prompt del juez incluye el valor propuesto → discriminamos por item.
      const prompt: string = body.messages[0].content;
      if (prompt.includes('"va"')) return judgeResponse(true); // A: supported
      if (prompt.includes('"vb"')) return judgeResponse(false); // B: no supported → drop
      throw new Error('verifier network error'); // C: error → unverified
    });

    const result = await verifyProposals('transcript', CONTEXT, survivors(), CONFIG, transport);

    const byItem = new Map(result.map((p) => [p.item_id, p]));
    // A sobrevive verified
    expect(byItem.get(ITEM_A)?.verification_status).toBe('verified');
    // B descartado
    expect(byItem.has(ITEM_B)).toBe(false);
    // C conservado, unverified (error no bloquea al resto)
    expect(byItem.get(ITEM_C)?.verification_status).toBe('unverified');
    expect(result).toHaveLength(2);
    // se llamó al juez una vez por propuesta (3)
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('error del juez en una propuesta no afecta el juicio de las demás', async () => {
    const transport = vi.fn(async (body: any) => {
      const prompt: string = body.messages[0].content;
      if (prompt.includes('"vb"')) throw new Error('timeout');
      return judgeResponse(true);
    });
    const result = await verifyProposals('transcript', CONTEXT, survivors(), CONFIG, transport);
    expect(result).toHaveLength(3);
    expect(result.find((p) => p.item_id === ITEM_B)?.verification_status).toBe('unverified');
    expect(result.find((p) => p.item_id === ITEM_A)?.verification_status).toBe('verified');
  });
});

describe('verifier — desactivado por default (R13)', () => {
  it('sin verificador: exactamente 1 llamada (la extracción) y verification_status nulo', async () => {
    const transport = vi.fn(async () => ({
      content: [
        {
          type: 'tool_use',
          name: 'propose_values',
          input: {
            proposals: [
              { item_id: ITEM_A, proposed_value: 'va', quote: 'la cita de a', confidence: 0.9 }
            ]
          }
        }
      ]
    }));

    const ctx: TemplateContext = {
      items: [
        { item_id: ITEM_A, label: 'A', section_title: 'S', help_text: null, field_type: 'text', options: null, filled_by: 'cliente', current_value: null }
      ]
    };
    const offConfig: AnalyzeConfig = { ...CONFIG, verifierEnabled: false };

    const result = await analyzeProposalsWith('la cita de a está acá', ctx, offConfig, transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].verification_status).toBeUndefined();
  });
});
