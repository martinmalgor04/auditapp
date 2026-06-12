# Design — #17 17_contexto_ia

## Alcance

Capa de **contexto enriquecido** sobre el pipeline de #14: tres fuentes opcionales (RAG Tango,
catálogo SyS, few-shot de informes ejemplares) que se ensamblan en un `InformeContext` y se
inyectan al prompt. Cada fuente se activa por env, falla a *fallback silencioso* (nunca rompe
la generación) y deja traza en `audit_report.context_meta`. El prompt base sube a **2.0**.

| Incluido | Excluido |
|---|---|
| Cliente RAG read-only contra Supabase externo de SyS (`match_documents`) | Ingesta/escritura en la base vectorial (vive fuera de auditapp) |
| Embeddings de consulta vía API Gemini | Vector store propio en la DB de auditapp |
| Catálogo SyS como módulo TS versionado + Zod | Catálogo editable por UI / en DB (si crece, feature futura) |
| Few-shot: flag `ejemplar` + endpoint + selección | UI de curaduría avanzada de ejemplares (solo toggle en revisión) |
| Presupuestos de tokens por fuente y total | Token counting exacto vía API (estimador chars/4 alcanza) |
| `context_meta` jsonb para trazabilidad | Benchmarks por rubro (declarado en descripción, **fuera de alcance**: no hay dataset aún; queda para fase 3 — ver Open questions) |

## Dependencias

| Feature / sistema | Contrato usado |
|---|---|
| `14_informe_ia` (#14) | `runInformePipeline`, `buildInformePrompt`, `INFORME_PROMPT_VERSION`, adapter Claude inyectable, `audit_report`, tests/fixtures golden |
| RAG Tango (externo, ya operativo) | Supabase: tabla `documents (id, content, metadata, embedding)`, RPC `match_documents(query_embedding, match_threshold, match_count)` + filtro por módulo en `metadata`; embeddings Gemini 3072 dims, cosine. Referencia operativa: skill `rag-tango` (`~/.claude/tools/rag_tango.py`) |
| API Gemini | `POST /v1beta/models/{model}:embedContent` con `GEMINI_API_KEY` (fetch nativo, sin SDK nuevo) |

**Prerrequisito duro:** #14 `done` (lo está). No depende de #15/#16.

## Arquitectura

```
runInformePipeline(reportId)
        │
        ▼
buildInformeContext(canonical, config, deps)        src/lib/server/informe/context/
        │
        ├─ config = resolveContextConfig(env)        flags + presupuestos        (R1)
        │
        ├─ [rag on]      ragSource.retrieve(queries)                             (R3–R7)
        │       queries = buildRagQueries(canonical)  ← circuitos más débiles
        │       módulo  = SECCION_TO_MODULO[seccion_code] ?? null               (R4)
        │       embedQuery (Gemini) → match_documents (Supabase RPC)            (R5)
        │       timeout/fallo → { chunks: [], error }                            (R6)
        │       trim a INFORME_RAG_MAX_TOKENS (similitud desc)                   (R7)
        │
        ├─ [catalogo on] catalogoSource.load()  ← módulo TS estático             (R8, R9)
        │
        ├─ [fewshot on]  fewshotSource.select() ← audit_report ejemplar+aprobado (R10, R11)
        │
        ▼
assemblePrompt(canonical, context)
        │  presupuesto total INFORME_PROMPT_MAX_TOKENS, recorte                  (R14)
        │  prompt_version = resolvePromptVersion(context)                        (R12)
        ▼
Claude API (sin cambios respecto de #14)
        │
        ▼
persistencia: prompt_version + context_meta                                      (R12, R13)
```

Principio rector: **el enriquecimiento nunca degrada la confiabilidad de #14**. Toda falla de
una fuente se traduce en «esa fuente no aporta» + registro en `context_meta`; el único error
nuevo terminal es el presupuesto total excedido por el propio canónico (R14, caso patológico).

## Archivos

### Nuevos

| Archivo | Contenido |
|---|---|
| `migrations/006_contexto_ia.sql` | `ALTER TABLE audit_report ADD COLUMN ejemplar boolean NOT NULL DEFAULT false; ADD COLUMN context_meta jsonb;` + índice parcial `audit_report_ejemplar_idx ON audit_report (approved_at DESC) WHERE ejemplar AND status = 'aprobado'` |
| `src/lib/server/informe/context/config.ts` | `resolveContextConfig(env): ContextConfig` — flags R1, presupuestos, thresholds, defaults |
| `src/lib/server/informe/context/tokens.ts` | `estimateTokens(text: string): number` (≈ `Math.ceil(chars / 4)`), `trimToBudget<T>(items, getText, budget)` |
| `src/lib/server/informe/context/build.ts` | `buildInformeContext(canonical, config, deps): Promise<InformeContext>` — orquesta fuentes con `Promise.allSettled` + timeout |
| `src/lib/server/informe/context/schemas.ts` | `contextMetaSchema` (Zod strict), tipos `InformeContext`, `RagChunk`, `ContextMeta` |
| `src/lib/server/informe/rag/queries.ts` | `buildRagQueries(canonical): RagQuery[]` — top `RAG_QUERY_CIRCUITS` (const 3) circuitos de menor score + observaciones con evidencia; `SECCION_TO_MODULO: Record<string, ModuloTango \| undefined>` |
| `src/lib/server/informe/rag/retriever.ts` | `createRagRetriever(env, fetchFn): RagRetriever` — `embedQuery` (Gemini) + RPC `match_documents` con header `apikey`/`Authorization` read-only; dedupe por `id`; interfaz `RagRetriever { retrieve(queries): Promise<RagResult> }` |
| `src/lib/server/informe/catalogo/catalogo-sys.ts` | `CATALOGO_SYS_VERSION = '1.0'`, `catalogoSchema`, `CATALOGO_SYS: CatalogoLinea[]` — líneas: Tango (módulos/Nexo/Restó/PdV), infraestructura (HPE/Lenovo/Dell), seguridad (Sophos), soporte/abonos, SysDesk; cada una con `rango_usd: { min, max }` y `condiciones` |
| `src/lib/server/informe/fewshot/select.ts` | `selectFewshotExamples(deps, config): Promise<FewshotExample[]>` — query ejemplares aprobados orden `approved_at DESC LIMIT n`, extractos de `client_draft` (resumen + riesgos + plan), trim a presupuesto |
| `src/routes/api/audits/[id]/report/[version]/ejemplar/+server.ts` | `POST` admin-only, body `{ ejemplar: boolean }` Zod, 409 si no `aprobado` (R10) |
| `tests/informe-context.test.ts`, `tests/informe-rag.test.ts`, `tests/informe-catalogo.test.ts`, `tests/informe-fewshot.test.ts`, `tests/api/informe-ejemplar.test.ts` | Suites nuevas (ver requirements) |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/lib/server/informe/prompts/generate-report.ts` | `INFORME_PROMPT_VERSION = '2.0'`; `buildInformePrompt(canonical, context?: InformeContext)` — bloques condicionales `<contexto_tango>` (RAG, con cita de módulo/fecha), `<catalogo_sys>` (solo instrucciones internas, regla sin producto cerrado), `<ejemplos>` (few-shot); `resolvePromptVersion(context): string` con sufijos ordenados `+rag` → `+catalogo` → `+fewshot` |
| `src/lib/server/informe/pipeline.ts` | Llama a `buildInformeContext` antes de armar el prompt; persiste `prompt_version` resuelto y `context_meta`; deps de contexto inyectables (default real, mocks en tests) |
| `src/lib/server/db/informe-reports.ts` | `setEjemplar(reportId, value)`, `listEjemplarReports(limit)`, persistencia de `context_meta` en el update de fin de pipeline |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte` | Toggle «Ejemplar» visible solo en `aprobado` + admin (POST al endpoint nuevo) |
| `.env.example` | Variables nuevas (R16) |

## Firmas clave

```ts
// context/config.ts
export interface ContextConfig {
  rag: { enabled: boolean; threshold: number; count: number; timeoutMs: number; maxTokens: number };
  catalogo: { enabled: boolean };
  fewshot: { enabled: boolean; maxExamples: number; maxTokens: number };
  promptMaxTokens: number;
}
export function resolveContextConfig(env: Record<string, string | undefined>): ContextConfig;

// rag/retriever.ts
export interface RagChunk { id: string; content: string; modulo: string | null; similarity: number; fecha?: string }
export interface RagResult { chunks: RagChunk[]; discarded: number; error?: string }
export interface RagRetriever { retrieve(queries: RagQuery[]): Promise<RagResult> }

// context/build.ts
export interface InformeContext {
  rag: RagResult | null;            // null = fuente off
  catalogo: { version: string; lineas: CatalogoLinea[] } | null;
  fewshot: { examples: FewshotExample[] } | null;
  meta: ContextMeta;                // persiste en audit_report.context_meta
}
export function buildInformeContext(
  canonical: CanonicalAudit, config: ContextConfig, deps: ContextDeps
): Promise<InformeContext>;

// prompts/generate-report.ts
export function resolvePromptVersion(context: InformeContext | null): string; // '2.0' | '2.0+rag' | ...
```

## Decisiones y alternativas descartadas

1. **Lectura directa al Supabase externo vs. copiar la base a la DB propia (pgvector).**
   Descartado copiar: la base vive y se re-ingesta fuera de auditapp (pipeline de marketing SyS);
   duplicarla crea drift y obliga a operar pgvector + sincronización. Leer el RPC existente con
   key read-only es 1 fetch y cero mantenimiento. Riesgo (latencia/caída) mitigado por R6.
2. **Catálogo en módulo TS versionado vs. tabla en DB.** Descartada la tabla: el catálogo cambia
   poco, necesita review humana (PR) y versionado explícito (`CATALOGO_SYS_VERSION`) para
   trazabilidad del prompt; una tabla exige UI de ABM y seed, sin beneficio hoy. Si en el futuro
   comercial lo edita, se migra (el schema Zod ya es el contrato).
3. **`prompt_version` con sufijos vs. columna booleana `enriquecido`.** Descartada la booleana:
   los sufijos (`2.0+rag+catalogo`) identifican exactamente qué contexto entró en cada
   generación sin parsear `context_meta`, y cumplen el acceptance de «distinguir generaciones».
4. **Estimador de tokens chars/4 vs. tokenizer real / API count_tokens.** Descartado el exacto:
   agrega dependencia o round-trip por generación; los presupuestos son límites de seguridad,
   no contabilidad fina. Margen conservador en defaults.
5. **Few-shot con informes completos vs. extractos.** Descartado completo: un `client_draft`
   entero consume ~6-10k tokens; extractos (resumen + riesgos + plan) transmiten tono y
   estructura, que es lo que se quiere imitar, a ~1/3 del costo.
6. **SDK de Google (`@google/genai`) vs. fetch nativo para embeddings.** Descartado el SDK: un
   solo endpoint estable, fetch elimina una dependencia y simplifica el mock (R15).

## Errores

Sin errores terminales nuevos salvo presupuesto excedido del canónico (R14): reutiliza el flujo
`status = 'error'` + `error_message` de #14 (mensaje `'Prompt excede INFORME_PROMPT_MAX_TOKENS aun sin contexto'`).
Fallos de fuentes → strings en `context_meta.{rag,catalogo,fewshot}.error`, nunca throw fuera
de `buildInformeContext`.

## Seguridad

- `RAG_TANGO_SUPABASE_KEY` debe ser anon/read-only; el retriever solo emite el RPC y embeddings
  (nada de PostgREST de escritura). Nunca va al cliente (módulo `server/`).
- El contenido RAG entra al prompt como texto citado; el draft sigue validado por los schemas
  Zod strict de #14 — un chunk malicioso no puede inyectar campos.
- Endpoint `ejemplar`: mismas guards `requireAdminApi` de #14.

## Nota de oportunidad

`progress`/backlog indican «encarar recién con varias auditorías reales procesadas»: el few-shot
rinde con ejemplares reales, pero el diseño es implementable hoy — R11 define explícitamente el
comportamiento con 0 ejemplares y los flags permiten desplegar con todo off.

## Open questions (para la puerta humana)

1. **Credenciales RAG:** ¿existe una anon key read-only del Supabase del RAG Tango para uso de
   auditapp, o hay que crearla? (El script `rag_tango.py` ya usa una — confirmar si es la misma.)
2. **Modelo de embeddings exacto:** la skill dice «Gemini Embedding 2 (3072 dims)»; el CLAUDE.md
   raíz menciona `text-embedding-004` (768 dims) para otro stack. El default propuesto
   (`gemini-embedding-001`, 3072) debe confirmarse contra lo que realmente usa la base — si no
   coincide la dimensión, `match_documents` no matchea nada.
3. **Contenido inicial del catálogo:** rangos USD por línea y condiciones los define comercial
   (Daniel/Martín). El spec fija el schema; los valores del seed v1 necesitan input humano.
4. **Benchmarks por rubro:** la descripción de la feature los menciona, pero no hay dataset.
   Propuesto: fuera de alcance de #17 (fase 3). Confirmar.
