import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INFORME_PROMPT_VERSION,
  JERGA_PROHIBIDA,
  buildInformePrompt,
  resolvePromptVersion
} from '../src/lib/server/informe/prompts/generate-report';
import { emptyContextMeta } from '../src/lib/server/informe/context/schemas';
import type { InformeContext } from '../src/lib/server/informe/context/schemas';
import { loadCatalogoSys } from '../src/lib/server/informe/catalogo/catalogo-sys';
import { loadInformeCanonicalGolden } from './fixtures/informe-claude-mock';

describe('informe prompt (R9, R12, R18, R19)', () => {
  const canonical = loadInformeCanonicalGolden();
  const prompt = buildInformePrompt(canonical);

  it('exporta versión 2.0 y la usa el módulo versionado', () => {
    expect(INFORME_PROMPT_VERSION).toBe('2.0');
    const pipelineSource = readFileSync(
      join(process.cwd(), 'src/lib/server/informe/pipeline.ts'),
      'utf8'
    );
    expect(pipelineSource).toContain("from './prompts/generate-report'");
    expect(pipelineSource).toContain('buildInformePrompt');
    expect(pipelineSource).not.toContain('consultor IT senior');
  });

  it('instruye líneas/rangos y prohíbe producto cerrado (R18)', () => {
    expect(prompt.system).toContain('líneas de solución y rangos de precio');
    expect(prompt.system).toContain('NUNCA fijar marca, modelo ni producto específico cerrado');
  });

  it('incluye los seis términos de jerga prohibida (R19)', () => {
    for (const term of JERGA_PROHIBIDA) {
      expect(prompt.system).toContain(term);
    }
    expect(JERGA_PROHIBIDA).toHaveLength(6);
  });

  it('el turno user lleva el canónico completo', () => {
    expect(JSON.parse(prompt.user)).toEqual(canonical);
  });

  it('catálogo on: bloque en instrucciones internas con regla sin producto cerrado (R9)', () => {
    const catalogo = loadCatalogoSys();
    const ctx: InformeContext = {
      rag: null,
      catalogo,
      fewshot: null,
      meta: {
        ...emptyContextMeta({ rag: false, catalogo: true, fewshot: false }),
        injected: { rag: false, catalogo: true, fewshot: false },
        catalogo: { version: catalogo.version, tokens: 100 }
      }
    };
    const enriched = buildInformePrompt(canonical, ctx);
    expect(enriched.system).toContain('<catalogo_sys>');
    expect(enriched.system).toContain('sin producto cerrado');
    expect(enriched.system).toContain('EXCLUSIVO de la salida interna');
    const clienteSection = enriched.system.split('## Reglas para la salida "cliente"')[1] ?? '';
    expect(clienteSection).not.toContain('<catalogo_sys>');
    expect(clienteSection).not.toContain('catálogo SyS');
  });

  it('resolvePromptVersion cubre combinaciones y fallback sin +rag (R12)', () => {
    expect(resolvePromptVersion(null)).toBe('2.0');

    const none: InformeContext = {
      rag: null,
      catalogo: null,
      fewshot: null,
      meta: emptyContextMeta({ rag: false, catalogo: false, fewshot: false })
    };
    expect(resolvePromptVersion(none)).toBe('2.0');

    const all: InformeContext = {
      rag: { chunks: [{ id: '1', content: 'x', modulo: null, similarity: 0.5 }], discarded: 0 },
      catalogo: loadCatalogoSys(),
      fewshot: { examples: [{ reportId: 'r1', text: 'ejemplo' }] },
      meta: {
        ...emptyContextMeta({ rag: true, catalogo: true, fewshot: true }),
        injected: { rag: true, catalogo: true, fewshot: true }
      }
    };
    expect(resolvePromptVersion(all)).toBe('2.0+rag+catalogo+fewshot');

    const ragFailed: InformeContext = {
      rag: { chunks: [], discarded: 0, error: 'timeout' },
      catalogo: null,
      fewshot: null,
      meta: {
        ...emptyContextMeta({ rag: true, catalogo: false, fewshot: false }),
        rag: { used: 0, discarded: 0, tokens: 0, error: 'timeout' },
        injected: { rag: false, catalogo: false, fewshot: false }
      }
    };
    expect(resolvePromptVersion(ragFailed)).toBe('2.0');

    const ragOnly: InformeContext = {
      ...all,
      catalogo: null,
      fewshot: null,
      meta: {
        ...all.meta,
        injected: { rag: true, catalogo: false, fewshot: false }
      }
    };
    expect(resolvePromptVersion(ragOnly)).toBe('2.0+rag');
  });
});
