import { z } from 'zod';
import type { CatalogoLinea } from '../catalogo/catalogo-sys';

export const contextMetaSchema = z
  .object({
    flags: z
      .object({
        rag: z.boolean(),
        catalogo: z.boolean(),
        fewshot: z.boolean()
      })
      .strict(),
    rag: z
      .object({
        used: z.number().int().min(0),
        discarded: z.number().int().min(0),
        tokens: z.number().int().min(0),
        error: z.string().optional()
      })
      .strict(),
    catalogo: z
      .object({
        version: z.string().optional(),
        tokens: z.number().int().min(0),
        error: z.string().optional()
      })
      .strict(),
    fewshot: z
      .object({
        ids: z.array(z.string()),
        tokens: z.number().int().min(0),
        error: z.string().optional()
      })
      .strict(),
    injected: z
      .object({
        rag: z.boolean(),
        catalogo: z.boolean(),
        fewshot: z.boolean()
      })
      .strict()
  })
  .strict();

export type ContextMeta = z.infer<typeof contextMetaSchema>;

export type RagChunk = {
  id: string;
  content: string;
  modulo: string | null;
  similarity: number;
  fecha?: string;
};

export type RagResult = {
  chunks: RagChunk[];
  discarded: number;
  error?: string;
};

export type FewshotExample = {
  reportId: string;
  text: string;
};

export type InformeContext = {
  rag: RagResult | null;
  catalogo: { version: string; lineas: CatalogoLinea[] } | null;
  fewshot: { examples: FewshotExample[] } | null;
  meta: ContextMeta;
  promptBudgetError?: string;
};

export function emptyContextMeta(flags: ContextMeta['flags']): ContextMeta {
  return {
    flags,
    rag: { used: 0, discarded: 0, tokens: 0 },
    catalogo: { tokens: 0 },
    fewshot: { ids: [], tokens: 0 },
    injected: { rag: false, catalogo: false, fewshot: false }
  };
}
