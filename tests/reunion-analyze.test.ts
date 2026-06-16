import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  analyzeProposals,
  analyzeProposalsWith,
  readAnalyzeConfig,
  type AnalyzeConfig,
  type AnthropicMessage
} from '../src/lib/server/reunion/pipeline/analyze';
import type { TemplateContext } from '../src/lib/server/reunion/pipeline/context';

const ITEM_TANGO = '11111111-1111-1111-1111-111111111111';

const CONTEXT: TemplateContext = {
  items: [
    {
      item_id: ITEM_TANGO,
      label: '¿Usa ERP Tango?',
      section_title: 'ERP',
      help_text: '¿El cliente usa Tango Gestión?',
      field_type: 'text',
      options: null,
      filled_by: 'cliente',
      current_value: null
    }
  ]
};

const TRANSCRIPT = 'El cliente usa Tango hace 5 años. Tiene 50 empleados.';

const BASE_CONFIG: AnalyzeConfig = {
  model: 'claude-sonnet-4-6',
  confidenceMin: 0.5,
  verifierEnabled: false,
  verifierModel: 'claude-haiku-4-5'
};

function toolUseResponse(proposals: unknown[]): AnthropicMessage {
  return {
    content: [{ type: 'tool_use', name: 'propose_values', input: { proposals } }]
  };
}

describe('analyze — tool use forzado y lectura del bloque (R3)', () => {
  it('arma body con tool_choice forzado a propose_values y lee el tool_use', async () => {
    let captured: any;
    const transport = vi.fn(async (body: unknown) => {
      captured = body;
      return toolUseResponse([
        {
          item_id: ITEM_TANGO,
          proposed_value: 'Usa Tango hace 5 años',
          quote: 'El cliente usa Tango hace 5 años',
          confidence: 0.9
        }
      ]);
    });

    const result = await analyzeProposalsWith(TRANSCRIPT, CONTEXT, BASE_CONFIG, transport);
    expect(captured.tool_choice).toEqual({ type: 'tool', name: 'propose_values' });
    expect(captured.tools[0].name).toBe('propose_values');
    expect(result).toHaveLength(1);
    expect(result[0].item_id).toBe(ITEM_TANGO);
  });

  it('respuesta sólo-texto → 0 propuestas sin excepción (R3)', async () => {
    const transport = vi.fn(async () => ({
      content: [{ type: 'text', text: 'No encontré nada para proponer.' }]
    }));
    const result = await analyzeProposalsWith(TRANSCRIPT, CONTEXT, BASE_CONFIG, transport);
    expect(result).toEqual([]);
  });

  it('tool_use con input inválido → 0 propuestas sin excepción (R3)', async () => {
    const transport = vi.fn(async () => ({
      content: [{ type: 'tool_use', name: 'propose_values', input: { wrong: true } }]
    }));
    const result = await analyzeProposalsWith(TRANSCRIPT, CONTEXT, BASE_CONFIG, transport);
    expect(result).toEqual([]);
  });
});

describe('analyze — modelo configurable (R4)', () => {
  afterEach(() => {
    delete process.env.REUNION_ANALYSIS_MODEL;
  });

  it('default claude-sonnet-4-6 cuando no hay env', () => {
    delete process.env.REUNION_ANALYSIS_MODEL;
    expect(readAnalyzeConfig().model).toBe('claude-sonnet-4-6');
  });

  it('override por REUNION_ANALYSIS_MODEL', () => {
    process.env.REUNION_ANALYSIS_MODEL = 'claude-haiku-4-5';
    expect(readAnalyzeConfig().model).toBe('claude-haiku-4-5');
  });

  it('el body usa config.model', async () => {
    let captured: any;
    const transport = vi.fn(async (body: unknown) => {
      captured = body;
      return toolUseResponse([]);
    });
    await analyzeProposalsWith(TRANSCRIPT, CONTEXT, { ...BASE_CONFIG, model: 'claude-haiku-4-5' }, transport);
    expect(captured.model).toBe('claude-haiku-4-5');
  });
});

describe('analyze — transport real llama a Anthropic, no a OpenAI (R2, R5)', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('POST a api.anthropic.com/v1/messages con headers x-api-key + anthropic-version, no a OpenAI', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk-ant-test');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(url).not.toContain('openai');
      return new Response(JSON.stringify(toolUseResponse([])), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await analyzeProposals(TRANSCRIPT, CONTEXT, BASE_CONFIG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin ANTHROPIC_API_KEY lanza error explícito (R5)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(analyzeProposals(TRANSCRIPT, CONTEXT, BASE_CONFIG)).rejects.toThrow(
      'ANTHROPIC_API_KEY no configurado'
    );
  });

  it('HTTP no-OK de Anthropic lanza Analysis API error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('boom', { status: 500 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(analyzeProposals(TRANSCRIPT, CONTEXT, BASE_CONFIG)).rejects.toThrow(
      /Analysis API error 500/
    );
  });
});
