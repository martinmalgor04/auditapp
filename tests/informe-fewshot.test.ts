import { describe, expect, it } from 'vitest';
import { selectFewshotExamples } from '../src/lib/server/informe/fewshot/select';
import { resolveContextConfig } from '../src/lib/server/informe/context/config';
import { buildValidClientDraft } from './fixtures/informe-claude-mock';

describe('informe few-shot (R11)', () => {
  const config = resolveContextConfig({ INFORME_FEWSHOT_ENABLED: '1', INFORME_FEWSHOT_MAX_TOKENS: '500' });

  it('selecciona los N más recientes y recorta al presupuesto', async () => {
    const drafts = ['a', 'b', 'c'].map((id, i) => ({
      id,
      approvedAt: new Date(Date.now() - i * 1000),
      clientDraft: buildValidClientDraft(['A1'])
    }));

    const examples = await selectFewshotExamples(
      {
        listEjemplarReports: async (limit) => drafts.slice(0, limit)
      },
      { ...config, fewshot: { ...config.fewshot, maxExamples: 2 } }
    );

    expect(examples).toHaveLength(2);
    expect(examples[0].reportId).toBe('a');
    expect(examples[1].reportId).toBe('b');
    const totalChars = examples.reduce((n, e) => n + e.text.length, 0);
    expect(totalChars).toBeLessThanOrEqual(500 * 4 + 100);
  });

  it('0 ejemplares → lista vacía sin error', async () => {
    const examples = await selectFewshotExamples(
      { listEjemplarReports: async () => [] },
      config
    );
    expect(examples).toEqual([]);
  });
});
