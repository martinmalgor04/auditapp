import { describe, expect, it, vi } from 'vitest';
import {
  buildRagQueries,
  resolveModuloForSeccion,
  SECCION_TO_MODULO
} from '../src/lib/server/informe/rag/queries';
import { createRagRetriever } from '../src/lib/server/informe/rag/retriever';
import { formatRagBlock } from '../src/lib/server/informe/context/build';
import { loadInformeCanonicalGolden } from './fixtures/informe-claude-mock';

describe('informe RAG (R3, R4, R5, R15)', () => {
  const canonical = loadInformeCanonicalGolden();

  it('buildRagQueries deriva consultas de circuitos más débiles (R3)', () => {
    const queries = buildRagQueries(canonical);
    expect(queries.length).toBeLessThanOrEqual(3);
    expect(queries[0].seccion_code).toBe('A1');
    expect(queries[0].text).toContain('score 20');
    const codes = queries.map((q) => q.seccion_code);
    expect(codes).toContain('A3');
  });

  it('SECCION_TO_MODULO cubre códigos ERP seed (R4)', () => {
    expect(SECCION_TO_MODULO.B2).toBe('ventas');
    expect(SECCION_TO_MODULO.B4).toBe('stock');
    expect(SECCION_TO_MODULO.E5).toBe('contabilidad');
    expect(resolveModuloForSeccion('A1')).toBeNull();
    expect(resolveModuloForSeccion('B7')).toBeNull();
  });

  it('retriever mock: embeddings + RPC, sin escritura, filtra bajo umbral (R5, R15)', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('embedContent')) {
        return new Response(JSON.stringify({ embedding: { values: [0.1, 0.2, 0.3] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('match_documents')) {
        return new Response(
          JSON.stringify([
            {
              id: 'ok',
              content: 'chunk válido',
              similarity: 0.55,
              metadata: { modulo_tango: 'ventas', fecha_video: '2024-01-01' }
            },
            {
              id: 'low',
              content: 'chunk bajo umbral',
              similarity: 0.2,
              metadata: { modulo_tango: 'ventas' }
            }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init?.method === 'PUT' || init?.method === 'PATCH' || init?.method === 'DELETE') {
        throw new Error('escritura no permitida');
      }
      return new Response('not found', { status: 404 });
    });

    const retriever = createRagRetriever(
      {
        GEMINI_API_KEY: 'test-gemini',
        RAG_TANGO_SUPABASE_URL: 'https://example.supabase.co',
        RAG_TANGO_SUPABASE_KEY: 'anon-key',
        RAG_GEMINI_EMBEDDING_MODEL: 'gemini-embedding-001',
        RAG_MATCH_THRESHOLD: '0.40',
        RAG_MATCH_COUNT: '8'
      },
      fetchFn as typeof fetch
    );

    const result = await retriever.retrieve([
      { text: 'ventas sin controles', seccion_code: 'B2', modulo: 'ventas' }
    ]);

    expect(calls.some((c) => c.url.includes('gemini-embedding-001'))).toBe(true);
    const rpc = calls.find((c) => c.url.includes('match_documents'));
    expect(rpc?.body).toMatchObject({
      match_threshold: 0.4,
      match_count: 8
    });
    expect(calls.every((c) => c.method === 'POST')).toBe(true);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].id).toBe('ok');
    expect(formatRagBlock(result.chunks)).toContain('chunk válido');
    expect(result.chunks.some((c) => c.content.includes('bajo umbral'))).toBe(false);
  });

  it('consulta sin mapeo usa modulo null (R4)', () => {
    const queries = buildRagQueries(canonical);
    const itQuery = queries.find((q) => q.seccion_code === 'A1');
    expect(itQuery?.modulo).toBeNull();
  });
});
