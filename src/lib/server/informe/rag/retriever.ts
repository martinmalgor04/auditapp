import type { RagQuery } from './queries';
import type { RagChunk, RagResult } from '../context/schemas';

export type RagRetriever = {
  retrieve(queries: RagQuery[]): Promise<RagResult>;
};

type FetchFn = typeof fetch;

type MatchRow = {
  id: string;
  content: string;
  similarity: number;
  metadata?: {
    modulo_tango?: string;
    fecha_video?: string;
    fecha_indexado?: string;
  };
};

function chunkFromRow(row: MatchRow, moduloFilter: string | null): RagChunk | null {
  const similarity = row.similarity ?? 0;
  const modulo = row.metadata?.modulo_tango ?? null;
  if (moduloFilter && modulo !== moduloFilter) {
    return null;
  }
  const fecha = row.metadata?.fecha_video ?? row.metadata?.fecha_indexado;
  return {
    id: row.id,
    content: row.content,
    modulo,
    similarity,
    ...(fecha ? { fecha: fecha.slice(0, 10) } : {})
  };
}

async function embedQuery(
  text: string,
  env: Record<string, string | undefined>,
  fetchFn: FetchFn
): Promise<number[]> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }
  const model = env.RAG_GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: text.slice(0, 8000) }] }
    })
  });
  if (!res.ok) {
    throw new Error(`Gemini embeddings HTTP ${res.status}`);
  }
  const body = (await res.json()) as { embedding?: { values?: number[] } };
  const values = body.embedding?.values;
  if (!values?.length) {
    throw new Error('Respuesta de embedding inválida');
  }
  return values;
}

async function matchDocuments(
  embedding: number[],
  env: Record<string, string | undefined>,
  fetchFn: FetchFn,
  threshold: number,
  count: number
): Promise<MatchRow[]> {
  const url = env.RAG_TANGO_SUPABASE_URL?.replace(/\/$/, '');
  const key = env.RAG_TANGO_SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('RAG Supabase no configurado');
  }
  const res = await fetchFn(`${url}/rest/v1/rpc/match_documents`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: count
    })
  });
  if (!res.ok) {
    throw new Error(`match_documents HTTP ${res.status}`);
  }
  return (await res.json()) as MatchRow[];
}

export function createRagRetriever(
  env: Record<string, string | undefined>,
  fetchFn: FetchFn = fetch
): RagRetriever {
  const threshold = Number.parseFloat(env.RAG_MATCH_THRESHOLD ?? '0.4');
  const count = Number.parseInt(env.RAG_MATCH_COUNT ?? '8', 10);

  return {
    async retrieve(queries: RagQuery[]): Promise<RagResult> {
      const byId = new Map<string, RagChunk>();
      let belowThreshold = 0;

      for (const query of queries) {
        const embedding = await embedQuery(query.text, env, fetchFn);
        const rows = await matchDocuments(embedding, env, fetchFn, threshold, count);
        for (const row of rows) {
          if ((row.similarity ?? 0) < threshold) {
            belowThreshold++;
            continue;
          }
          const chunk = chunkFromRow(row, query.modulo);
          if (!chunk) {
            continue;
          }
          const prev = byId.get(chunk.id);
          if (!prev || chunk.similarity > prev.similarity) {
            byId.set(chunk.id, chunk);
          }
        }
      }

      const chunks = [...byId.values()].sort((a, b) => b.similarity - a.similarity);
      return { chunks, discarded: belowThreshold };
    }
  };
}
