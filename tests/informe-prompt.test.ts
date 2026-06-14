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
import {
  loadInformeCanonicalErp,
  loadInformeCanonicalIt
} from './fixtures/informe-canonical-variants';

describe('informe prompt (R9, R12, R18, R19, #19 R8)', () => {
  const erpCanonical = loadInformeCanonicalErp();
  const erpPrompt = buildInformePrompt(erpCanonical);

  it('exporta versión 2.1 y la usa el módulo versionado', () => {
    expect(INFORME_PROMPT_VERSION).toBe('2.1');
    expect(INFORME_PROMPT_VERSION).not.toBe('2.0');
    const pipelineSource = readFileSync(
      join(process.cwd(), 'src/lib/server/informe/pipeline.ts'),
      'utf8'
    );
    expect(pipelineSource).toContain("from './prompts/generate-report'");
    expect(pipelineSource).toContain('buildInformePrompt');
    expect(pipelineSource).not.toContain('consultor IT senior');
  });

  it('instruye líneas/rangos y prohíbe producto cerrado (R18)', () => {
    expect(erpPrompt.system).toContain('líneas de solución y rangos de precio');
    expect(erpPrompt.system).toContain('NUNCA fijar marca, modelo ni producto específico cerrado');
  });

  it('prompt ERP mantiene funcionalidades Tango (R8)', () => {
    expect(erpPrompt.system).toContain('funcionalidades Tango existentes');
  });

  it('prompt IT prohíbe funcionalidades Tango (R8)', () => {
    const itPrompt = buildInformePrompt(loadInformeCanonicalIt());
    expect(itPrompt.system).toContain('PROHIBIDO proponer funcionalidades Tango');
    const clienteIt = itPrompt.system.split('## Reglas para la salida "cliente"')[1] ?? '';
    expect(clienteIt).not.toContain('funcionalidades Tango existentes');
  });

  it('prompt mixta incluye ambos dominios (R8)', () => {
    const mixta = buildInformePrompt(loadInformeCanonicalGolden());
    expect(mixta.system).toContain('cross-dominio');
    expect(mixta.system).toContain('funcionalidades Tango existentes');
  });

  it('incluye los seis términos de jerga prohibida en ERP, IT y mixta (R19, R8)', () => {
    for (const term of JERGA_PROHIBIDA) {
      expect(erpPrompt.system).toContain(term);
      expect(buildInformePrompt(loadInformeCanonicalIt()).system).toContain(term);
      expect(buildInformePrompt(loadInformeCanonicalGolden()).system).toContain(term);
    }
    expect(JERGA_PROHIBIDA).toHaveLength(6);
  });

  it('el turno user lleva el canónico completo', () => {
    expect(JSON.parse(erpPrompt.user)).toEqual(erpCanonical);
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
    const enriched = buildInformePrompt(erpCanonical, ctx);
    expect(enriched.system).toContain('<catalogo_sys>');
    expect(enriched.system).toContain('sin producto cerrado');
    expect(enriched.system).toContain('EXCLUSIVO de la salida interna');
    const clienteSection = enriched.system.split('## Reglas para la salida "cliente"')[1] ?? '';
    expect(clienteSection).not.toContain('<catalogo_sys>');
    expect(clienteSection).not.toContain('catálogo SyS');
  });

  it('resolvePromptVersion cubre combinaciones y fallback sin +rag (R12)', () => {
    expect(resolvePromptVersion(null)).toBe('2.1');

    const none: InformeContext = {
      rag: null,
      catalogo: null,
      fewshot: null,
      meta: emptyContextMeta({ rag: false, catalogo: false, fewshot: false })
    };
    expect(resolvePromptVersion(none)).toBe('2.1');

    const all: InformeContext = {
      rag: { chunks: [{ id: '1', content: 'x', modulo: null, similarity: 0.5 }], discarded: 0 },
      catalogo: loadCatalogoSys(),
      fewshot: { examples: [{ reportId: 'r1', text: 'ejemplo' }] },
      meta: {
        ...emptyContextMeta({ rag: true, catalogo: true, fewshot: true }),
        injected: { rag: true, catalogo: true, fewshot: true }
      }
    };
    expect(resolvePromptVersion(all)).toBe('2.1+rag+catalogo+fewshot');

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
    expect(resolvePromptVersion(ragFailed)).toBe('2.1');

    const ragOnly: InformeContext = {
      ...all,
      catalogo: null,
      fewshot: null,
      meta: {
        ...all.meta,
        injected: { rag: true, catalogo: false, fewshot: false }
      }
    };
    expect(resolvePromptVersion(ragOnly)).toBe('2.1+rag');
  });
});
