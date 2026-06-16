import { describe, it, expect, vi } from 'vitest';
import {
  analyzeProposalsWith,
  type AnalyzeConfig,
  type AnthropicMessage
} from '../src/lib/server/reunion/pipeline/analyze';
import type { TemplateContext } from '../src/lib/server/reunion/pipeline/context';

const ITEM_TRI = '11111111-1111-1111-1111-111111111111'; // tri: si/no/parcial
const ITEM_TEXT_A = '22222222-2222-2222-2222-222222222222';
const ITEM_TEXT_B = '33333333-3333-3333-3333-333333333333';

const CONTEXT: TemplateContext = {
  items: [
    { item_id: ITEM_TRI, label: 'Tri', section_title: 'S', help_text: null, field_type: 'tri', options: null, filled_by: 'cliente', current_value: null },
    { item_id: ITEM_TEXT_A, label: 'A', section_title: 'S', help_text: null, field_type: 'text', options: null, filled_by: 'cliente', current_value: null },
    { item_id: ITEM_TEXT_B, label: 'B', section_title: 'S', help_text: null, field_type: 'text', options: null, filled_by: 'cliente', current_value: null }
  ]
};

const CONFIG: AnalyzeConfig = {
  model: 'claude-sonnet-4-6',
  confidenceMin: 0.5,
  verifierEnabled: false,
  verifierModel: 'claude-haiku-4-5'
};

const TRANSCRIPT = 'cita compartida entre dos items. otra cita distinta presente.';

function toolUse(proposals: unknown[]): AnthropicMessage {
  return { content: [{ type: 'tool_use', name: 'propose_values', input: { proposals } }] };
}

describe('orden de guards (R14)', () => {
  it('una propuesta inválida por tipo nunca llega a grounding (se descarta en el paso 1)', async () => {
    // tri con valor "quizás" es inválido → debe caer antes de grounding aunque la cita exista.
    const transport = vi.fn(async () =>
      toolUse([
        { item_id: ITEM_TRI, proposed_value: 'quizás', quote: 'cita compartida entre dos items', confidence: 0.9 },
        { item_id: ITEM_TEXT_A, proposed_value: 'ok', quote: 'otra cita distinta presente', confidence: 0.9 }
      ])
    );
    const result = await analyzeProposalsWith(TRANSCRIPT, CONTEXT, CONFIG, transport);
    expect(result.map((p) => p.item_id)).toEqual([ITEM_TEXT_A]);
  });

  it('una propuesta bajo umbral nunca se compara en dedup (cede su cita a la que sí pasa)', async () => {
    // Dos items con la MISMA cita; el de mayor confidence está bajo umbral → se descarta por umbral,
    // y el de menor confidence (pero sobre umbral) sobrevive. Si dedup corriera antes que umbral,
    // ganaría el de 0.95 y luego umbral lo tiraría, dejando 0 propuestas.
    const transport = vi.fn(async () =>
      toolUse([
        { item_id: ITEM_TEXT_A, proposed_value: 'a', quote: 'cita compartida entre dos items', confidence: 0.49 },
        { item_id: ITEM_TEXT_B, proposed_value: 'b', quote: 'cita compartida entre dos items', confidence: 0.6 }
      ])
    );
    const result = await analyzeProposalsWith(TRANSCRIPT, CONTEXT, CONFIG, transport);
    expect(result.map((p) => p.item_id)).toEqual([ITEM_TEXT_B]);
  });

  it('una cita inexistente se descarta por grounding antes del umbral', async () => {
    const transport = vi.fn(async () =>
      toolUse([
        { item_id: ITEM_TEXT_A, proposed_value: 'a', quote: 'esta cita no existe en el transcript', confidence: 0.99 }
      ])
    );
    const result = await analyzeProposalsWith(TRANSCRIPT, CONTEXT, CONFIG, transport);
    expect(result).toHaveLength(0);
  });
});
