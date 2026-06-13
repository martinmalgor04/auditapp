import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveContextConfig } from '../src/lib/server/informe/context/config';
import { applyTotalPromptBudget } from '../src/lib/server/informe/context/build';
import { contextMetaSchema, emptyContextMeta } from '../src/lib/server/informe/context/schemas';
import { estimateTokens, trimToBudget } from '../src/lib/server/informe/context/tokens';
import type { RagChunk } from '../src/lib/server/informe/context/schemas';
import { loadInformeCanonicalGolden } from './fixtures/informe-claude-mock';
import type { CanonicalAudit } from '../src/lib/server/canonical/schema';

const ENV_KEYS = [
  'INFORME_RAG_ENABLED',
  'INFORME_CATALOGO_ENABLED',
  'INFORME_FEWSHOT_ENABLED',
  'RAG_TANGO_SUPABASE_URL',
  'RAG_TANGO_SUPABASE_KEY',
  'GEMINI_API_KEY',
  'RAG_GEMINI_EMBEDDING_MODEL',
  'RAG_MATCH_THRESHOLD',
  'RAG_MATCH_COUNT',
  'INFORME_RAG_TIMEOUT_MS',
  'INFORME_RAG_MAX_TOKENS',
  'INFORME_FEWSHOT_MAX_EXAMPLES',
  'INFORME_FEWSHOT_MAX_TOKENS',
  'INFORME_PROMPT_MAX_TOKENS'
];

describe('informe context (R1, R7, R13, R14, R16)', () => {
  it('resolveContextConfig: todo off con env vacío o valores inválidos (R1)', () => {
    expect(resolveContextConfig({})).toMatchObject({
      rag: { enabled: false },
      catalogo: { enabled: false },
      fewshot: { enabled: false }
    });
    expect(resolveContextConfig({ INFORME_RAG_ENABLED: '0' }).rag.enabled).toBe(false);
    expect(resolveContextConfig({ INFORME_RAG_ENABLED: 'true' }).rag.enabled).toBe(false);
    expect(resolveContextConfig({ INFORME_RAG_ENABLED: '1' }).rag.enabled).toBe(true);
    expect(resolveContextConfig({ INFORME_CATALOGO_ENABLED: '1' }).catalogo.enabled).toBe(true);
    expect(resolveContextConfig({ INFORME_FEWSHOT_ENABLED: '1' }).fewshot.enabled).toBe(true);
  });

  it('estimateTokens es determinístico chars/4 (R7)', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('trimToBudget descarta items de menor prioridad (R7)', () => {
    const items = [
      { sim: 0.9, text: 'a'.repeat(400) },
      { sim: 0.5, text: 'b'.repeat(400) },
      { sim: 0.3, text: 'c'.repeat(400) }
    ];
    const { kept, discarded } = trimToBudget(items, (i) => i.text, 250);
    expect(kept).toHaveLength(2);
    expect(discarded).toBe(1);
    expect(kept[kept.length - 1].sim).toBe(0.5);
  });

  it('presupuesto RAG descarta chunks de menor similitud (R7)', () => {
    const chunks: RagChunk[] = [
      { id: '1', content: 'x'.repeat(8000), modulo: 'ventas', similarity: 0.9 },
      { id: '2', content: 'y'.repeat(8000), modulo: 'ventas', similarity: 0.5 },
      { id: '3', content: 'z'.repeat(8000), modulo: null, similarity: 0.4 }
    ];
    const sorted = [...chunks].sort((a, b) => b.similarity - a.similarity);
    const { kept, discarded } = trimToBudget(sorted, (c) => c.content, 5000);
    expect(discarded).toBeGreaterThan(0);
    expect(kept[0].similarity).toBe(0.9);
    expect(kept.every((c) => estimateTokens(c.content) <= 5000 || kept.length === 1)).toBe(true);
  });

  it('applyTotalPromptBudget recorta few-shot → RAG → catálogo (R14)', () => {
    const canonical = loadInformeCanonicalGolden();
    const flags = { rag: true, catalogo: true, fewshot: true };
    const base = emptyContextMeta(flags);
    const ctx = applyTotalPromptBudget(
      canonical,
      {
        rag: {
          chunks: [{ id: '1', content: 'r'.repeat(2000), modulo: 'ventas', similarity: 0.8 }],
          discarded: 0
        },
        catalogo: {
          version: '1.0',
          lineas: [
            {
              linea: 'Test',
              descripcion: 'd',
              proveedores: ['SyS'],
              rango_usd: { min: 1, max: 2 },
              condiciones: 'c'
            }
          ]
        },
        fewshot: { examples: [{ reportId: 'a', text: 'f'.repeat(2000) }] },
        meta: base
      },
      estimateTokens(JSON.stringify(canonical)) + 600
    );
    expect(ctx.meta.injected.fewshot).toBe(false);
    expect(ctx.fewshot?.examples).toHaveLength(0);
  });

  it('canónico gigante solo → error de presupuesto (R14)', () => {
    const huge = {
      ...loadInformeCanonicalGolden(),
      sections: Array.from({ length: 500 }, (_, i) => ({
        code: `X${i}`,
        title: 'x'.repeat(500),
        weight: 'alto' as const,
        score: 10,
        observations: 'o'.repeat(500),
        items: []
      }))
    } as CanonicalAudit;
    const result = applyTotalPromptBudget(
      huge,
      { rag: null, catalogo: null, fewshot: null, meta: emptyContextMeta({ rag: false, catalogo: false, fewshot: false }) },
      1000
    );
    expect(result.promptBudgetError).toContain('INFORME_PROMPT_MAX_TOKENS');
  });

  it('contextMetaSchema rechaza meta sin flags (R13)', () => {
    expect(
      contextMetaSchema.safeParse({
        rag: { used: 0, discarded: 0, tokens: 0 },
        catalogo: { tokens: 0 },
        fewshot: { ids: [], tokens: 0 },
        injected: { rag: false, catalogo: false, fewshot: false }
      }).success
    ).toBe(false);
    expect(
      contextMetaSchema.safeParse({
        flags: { rag: false, catalogo: false, fewshot: false },
        rag: { used: 0, discarded: 0, tokens: 0 },
        catalogo: { tokens: 0 },
        fewshot: { ids: [], tokens: 0 },
        injected: { rag: false, catalogo: false, fewshot: false }
      }).success
    ).toBe(true);
  });

  it('.env.example documenta las claves de contexto IA (R16)', () => {
    const content = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    for (const key of ENV_KEYS) {
      expect(content).toContain(key);
    }
  });
});
