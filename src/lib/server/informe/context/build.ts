import type { CanonicalAudit } from '$lib/server/canonical/schema';
import type { ContextConfig } from './config';
import { loadCatalogoSys } from '../catalogo/catalogo-sys';
import {
  fewshotTokens,
  formatFewshotBlock,
  selectFewshotExamples,
  type FewshotDeps
} from '../fewshot/select';
import { buildRagQueries } from '../rag/queries';
import type { RagRetriever } from '../rag/retriever';
import {
  emptyContextMeta,
  type ContextMeta,
  type InformeContext,
  type RagChunk,
  type FewshotExample
} from './schemas';
import { estimateTokens, trimToBudget } from './tokens';

export type ContextDeps = {
  rag?: RagRetriever;
  catalogo?: { load: () => ReturnType<typeof loadCatalogoSys> };
  fewshot?: FewshotDeps;
};

function ragChunkText(chunk: RagChunk): string {
  const meta = [chunk.modulo ? `módulo ${chunk.modulo}` : null, chunk.fecha ? `fecha ${chunk.fecha}` : null]
    .filter(Boolean)
    .join(', ');
  return meta ? `[${meta}] ${chunk.content}` : chunk.content;
}

function formatRagBlock(chunks: RagChunk[]): string {
  return chunks.map((c) => ragChunkText(c)).join('\n\n');
}

function formatCatalogoBlock(lineas: ReturnType<typeof loadCatalogoSys>['lineas']): string {
  return lineas
    .map(
      (l) =>
        `- ${l.linea}: ${l.descripcion} (${l.proveedores.join(', ')}). USD ${l.rango_usd.min}–${l.rango_usd.max}. ${l.condiciones}`
    )
    .join('\n');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function trimRagChunks(chunks: RagChunk[], maxTokens: number): { chunks: RagChunk[]; discarded: number } {
  const sorted = [...chunks].sort((a, b) => b.similarity - a.similarity);
  const { kept, discarded } = trimToBudget(sorted, ragChunkText, maxTokens);
  return { chunks: kept, discarded };
}

function estimateCanonicalTokens(canonical: CanonicalAudit): number {
  return estimateTokens(JSON.stringify(canonical));
}

/** Recorte total few-shot → RAG → catálogo (R14). */
export function applyTotalPromptBudget(
  canonical: CanonicalAudit,
  context: InformeContext,
  budget: number
): InformeContext {
  const base = estimateCanonicalTokens(canonical);
  if (base > budget) {
    return {
      ...context,
      promptBudgetError: 'Prompt excede INFORME_PROMPT_MAX_TOKENS aun sin contexto'
    };
  }

  let fewshot = context.fewshot?.examples ?? [];
  let ragChunks = context.rag?.chunks ?? [];
  let catalogoLineas = context.catalogo?.lineas ?? [];

  const blockTokens = () =>
    base +
    (fewshot.length ? fewshotTokens(fewshot) : 0) +
    (ragChunks.length ? estimateTokens(formatRagBlock(ragChunks)) : 0) +
    (catalogoLineas.length ? estimateTokens(formatCatalogoBlock(catalogoLineas)) : 0);

  if (blockTokens() <= budget) {
    return finalizeInjected(context, fewshot, ragChunks, catalogoLineas);
  }

  if (context.fewshot && fewshot.length > 0) {
    fewshot = [];
  }
  if (blockTokens() <= budget) {
    return finalizeInjected(context, fewshot, ragChunks, catalogoLineas);
  }

  if (context.rag && ragChunks.length > 0) {
    ragChunks = [];
  }
  if (blockTokens() <= budget) {
    return finalizeInjected(context, fewshot, ragChunks, catalogoLineas);
  }

  if (context.catalogo && catalogoLineas.length > 0) {
    catalogoLineas = [];
  }

  return finalizeInjected(context, fewshot, ragChunks, catalogoLineas);
}

function finalizeInjected(
  context: InformeContext,
  fewshot: FewshotExample[],
  ragChunks: RagChunk[],
  catalogoLineas: ReturnType<typeof loadCatalogoSys>['lineas']
): InformeContext {
  const meta: ContextMeta = {
    ...context.meta,
    rag: {
      ...context.meta.rag,
      used: ragChunks.length,
      tokens: ragChunks.length ? estimateTokens(formatRagBlock(ragChunks)) : 0
    },
    catalogo: {
      ...context.meta.catalogo,
      tokens: catalogoLineas.length ? estimateTokens(formatCatalogoBlock(catalogoLineas)) : 0
    },
    fewshot: {
      ...context.meta.fewshot,
      ids: fewshot.map((e) => e.reportId),
      tokens: fewshot.length ? fewshotTokens(fewshot) : 0
    },
    injected: {
      rag: ragChunks.length > 0,
      catalogo: catalogoLineas.length > 0,
      fewshot: fewshot.length > 0
    }
  };

  return {
    rag: context.rag ? { ...context.rag, chunks: ragChunks } : null,
    catalogo: context.catalogo ? { ...context.catalogo, lineas: catalogoLineas } : null,
    fewshot: context.fewshot ? { examples: fewshot } : null,
    meta,
    promptBudgetError: context.promptBudgetError
  };
}

export async function buildInformeContext(
  canonical: CanonicalAudit,
  config: ContextConfig,
  deps: ContextDeps = {}
): Promise<InformeContext> {
  const flags = {
    rag: config.rag.enabled,
    catalogo: config.catalogo.enabled,
    fewshot: config.fewshot.enabled
  };
  const meta = emptyContextMeta(flags);

  let rag: InformeContext['rag'] = null;
  let catalogo: InformeContext['catalogo'] = null;
  let fewshot: InformeContext['fewshot'] = null;

  const tasks: Promise<void>[] = [];

  if (config.rag.enabled && deps.rag) {
    tasks.push(
      (async () => {
        try {
          const queries = buildRagQueries(canonical);
          const result = await withTimeout(
            deps.rag!.retrieve(queries),
            config.rag.timeoutMs
          );
          const trimmed = trimRagChunks(result.chunks, config.rag.maxTokens);
          rag = {
            chunks: trimmed.chunks,
            discarded: result.discarded + trimmed.discarded
          };
          meta.rag = {
            used: trimmed.chunks.length,
            discarded: rag.discarded,
            tokens: trimmed.chunks.length ? estimateTokens(formatRagBlock(trimmed.chunks)) : 0
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          meta.rag.error = message;
          rag = { chunks: [], discarded: 0, error: message };
        }
      })()
    );
  }

  if (config.catalogo.enabled) {
    tasks.push(
      (async () => {
        try {
          const loaded = deps.catalogo?.load() ?? loadCatalogoSys();
          catalogo = loaded;
          meta.catalogo.version = loaded.version;
          meta.catalogo.tokens = estimateTokens(formatCatalogoBlock(loaded.lineas));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          meta.catalogo.error = message;
        }
      })()
    );
  }

  if (config.fewshot.enabled && deps.fewshot) {
    tasks.push(
      (async () => {
        try {
          const examples = await selectFewshotExamples(deps.fewshot!, config);
          fewshot = { examples };
          meta.fewshot.ids = examples.map((e) => e.reportId);
          meta.fewshot.tokens = examples.length ? fewshotTokens(examples) : 0;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          meta.fewshot.error = message;
          fewshot = { examples: [] };
        }
      })()
    );
  }

  await Promise.allSettled(tasks);

  const ctx: InformeContext = { rag, catalogo, fewshot, meta };
  return applyTotalPromptBudget(canonical, ctx, config.promptMaxTokens);
}

export { formatRagBlock, formatCatalogoBlock, formatFewshotBlock, ragChunkText };
