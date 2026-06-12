import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INFORME_PROMPT_VERSION,
  JERGA_PROHIBIDA,
  buildInformePrompt
} from '../src/lib/server/informe/prompts/generate-report';
import { loadInformeCanonicalGolden } from './fixtures/informe-claude-mock';

describe('informe prompt (R9, R18, R19)', () => {
  const canonical = loadInformeCanonicalGolden();
  const prompt = buildInformePrompt(canonical);

  it('exporta versión y la usa el módulo versionado (no inline en pipeline)', () => {
    expect(INFORME_PROMPT_VERSION).toBe('1.0');
    const pipelineSource = readFileSync(
      join(process.cwd(), 'src/lib/server/informe/pipeline.ts'),
      'utf8'
    );
    expect(pipelineSource).toContain("from './prompts/generate-report'");
    expect(pipelineSource).toContain('buildInformePrompt');
    // El texto del prompt no vive en el pipeline.
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

  it('incluye reglas del template: dimensiones, riesgos, diagnóstico, tono, stat null', () => {
    expect(prompt.system).toContain('items y observations');
    expect(prompt.system).toContain('Sin evidencia → «—»');
    expect(prompt.system).toContain('4 por defecto');
    expect(prompt.system).toContain('máximo 90 caracteres');
    expect(prompt.system).toContain('SIN voseo');
    expect(prompt.system).toContain('devolvé null');
    expect(prompt.system).toContain('razón social');
  });

  it('el turno user lleva el canónico completo', () => {
    expect(JSON.parse(prompt.user)).toEqual(canonical);
  });
});
