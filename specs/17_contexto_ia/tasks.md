# Tasks — #17 17_contexto_ia

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en
`progress/impl_17_contexto_ia.md`.

> Prerrequisito: #14 `done`. Sin dependencias npm nuevas (fetch nativo para Gemini/Supabase).
> Antes de T1 resolver open questions 1–3 del design (credenciales RAG, modelo de embeddings,
> valores del catálogo v1).

## Schema y DB

- [x] T1 — Crear `migrations/009_contexto_ia.sql`: `audit_report.ejemplar boolean NOT NULL DEFAULT false`, `audit_report.context_meta jsonb`, índice parcial `audit_report_ejemplar_idx (approved_at DESC) WHERE ejemplar AND status = 'aprobado'`. Cubre: **R10, R13**.
- [x] T2 — Extender `src/lib/server/db/informe-reports.ts`: `setEjemplar(reportId, value)` (solo filas `aprobado`), `listEjemplarReports(limit)` orden `approved_at DESC`, persistencia de `context_meta` al cierre del pipeline. Cubre: **R10, R11, R13**.

## Configuración y utilidades de contexto

- [x] T3 — Implementar `src/lib/server/informe/context/config.ts` (`resolveContextConfig` con flags `=== '1'`, defaults: threshold 0.40, count 8, timeout 10000, rag 6000 / fewshot 4000 / prompt 150000 tokens, 2 ejemplos) y `context/tokens.ts` (`estimateTokens` chars/4, `trimToBudget`). Cubre: **R1, R7**.
- [x] T4 — Implementar `src/lib/server/informe/context/schemas.ts`: tipos `InformeContext`, `RagChunk`, `FewshotExample` y `contextMetaSchema` Zod strict (flags efectivos, conteos rag usados/descartados, `catalogo_version`, ids few-shot, tokens estimados por fuente, errores por fallback). Cubre: **R13**.
- [x] T5 — Añadir `tests/informe-context.test.ts`: flags off por defecto y por valor inválido, presupuesto RAG descarta por similitud, orden de recorte total few-shot→RAG→catálogo, error terminal por canónico gigante, `contextMetaSchema`, check de claves en `.env.example`. Cubre: **R1, R7, R13, R14, R16**.

## RAG Tango

- [x] T6 — Implementar `src/lib/server/informe/rag/queries.ts`: `buildRagQueries` (3 circuitos de menor score del canónico + observaciones con evidencia) y `SECCION_TO_MODULO` cubriendo los `seccion_code` de las plantillas ERP seed; sin mapeo → `modulo: null`. Cubre: **R3, R4**.
- [x] T7 — Implementar `src/lib/server/informe/rag/retriever.ts`: `createRagRetriever(env, fetchFn)` — embedding de consulta vía Gemini (`RAG_GEMINI_EMBEDDING_MODEL`), RPC `match_documents` con `RAG_MATCH_THRESHOLD`/`RAG_MATCH_COUNT`, filtro por módulo, dedupe por id, solo lectura. Cubre: **R5, R15**.
- [x] T8 — Añadir `tests/informe-rag.test.ts` con fetch mock: consultas derivadas de circuitos débiles, mapeo de módulos, llamadas a embeddings y RPC con params de env, descarte bajo umbral, ausencia de llamadas de escritura. Cubre: **R3, R4, R5, R15**.

## Catálogo SyS

- [x] T9 — Implementar `src/lib/server/informe/catalogo/catalogo-sys.ts`: `catalogoSchema` Zod strict (`linea`, `descripcion`, `proveedores`, `rango_usd {min,max}`, `condiciones`), `CATALOGO_SYS_VERSION = '1.0'` y seed v1 (líneas Tango, infraestructura HPE/Lenovo/Dell, Sophos, soporte/abonos, SysDesk — valores confirmados por comercial). Cubre: **R8**.
- [x] T10 — Añadir `tests/informe-catalogo.test.ts`: seed pasa el schema, rechazos (`min > max`, sin `rango_usd`), versión no vacía. Cubre: **R8**.

## Few-shot

- [x] T11 — Implementar `src/lib/server/informe/fewshot/select.ts`: `selectFewshotExamples` (ejemplares aprobados más recientes, `INFORME_FEWSHOT_MAX_EXAMPLES`, extractos resumen+riesgos+plan del `client_draft`, trim a `INFORME_FEWSHOT_MAX_TOKENS`, 0 ejemplares → lista vacía sin error). Cubre: **R11**.
- [x] T12 — Crear `src/routes/api/audits/[id]/report/[version]/ejemplar/+server.ts`: POST admin-only, body Zod `{ ejemplar: boolean }`, 409 si no `aprobado`, 403/401 según guard. Cubre: **R10**.
- [x] T13 — Añadir `tests/informe-fewshot.test.ts` (selección, recorte, vacío) y `tests/api/informe-ejemplar.test.ts` (200/409/403/401). Cubre: **R10, R11**.

## Ensamblado, prompt y pipeline

- [x] T14 — Implementar `src/lib/server/informe/context/build.ts`: `buildInformeContext` con `Promise.allSettled` + timeout por fuente (`INFORME_RAG_TIMEOUT_MS`), fallback silencioso con error en meta, presupuesto total con orden de recorte few-shot→RAG→catálogo. Cubre: **R2, R6, R7, R14**.
- [x] T15 — Extender `src/lib/server/informe/prompts/generate-report.ts`: bump `INFORME_PROMPT_VERSION = '2.0'`, bloques condicionales `<contexto_tango>` / `<catalogo_sys>` (solo instrucciones internas, regla sin producto cerrado) / `<ejemplos>`, `resolvePromptVersion` con sufijos ordenados. Cubre: **R9, R12**.
- [x] T16 — Integrar en `src/lib/server/informe/pipeline.ts`: deps de contexto inyectables, llamada a `buildInformeContext` antes del prompt, persistencia de `prompt_version` resuelto y `context_meta` (también en camino `error`). Cubre: **R2, R6, R12, R13, R15**.
- [x] T17 — Extender `tests/informe-prompt.test.ts` (bloques condicionales, catálogo solo en instrucciones internas, `resolvePromptVersion` todas las combinaciones incl. fallback sin sufijo) y `tests/informe-pipeline.test.ts` (flags off no invocan fuentes y env mínimo alcanza; retriever que lanza/timeout → `borrador` + `context_meta.rag.error`; `context_meta` persistido completo). Cubre: **R2, R6, R9, R12, R13, R15**.

## UI y env

- [x] T18 — Toggle «Ejemplar» en la pantalla de revisión (`(app)/auditorias/[id]/informe/[version]/+page.svelte`), visible solo admin + estado `aprobado`, POST al endpoint de T12 con feedback de estado. Cubre: **R10**.
- [x] T19 — Documentar en `.env.example` las 14 variables nuevas de R16 con comentarios de default. Cubre: **R16**.

## Gates

- [x] T20 — `pnpm run check` y `pnpm test` verdes sin `GEMINI_API_KEY`, `RAG_TANGO_SUPABASE_URL` ni Supabase real; suite e2e existente (`e2e/informe.spec.ts` con `INFORME_FAKE=1`) sigue verde con flags off. Cubre: **R2, R15**.
- [x] T21 — `./init.sh` exit 0; trazabilidad completa R1–R16 ↔ tests en `progress/impl_17_contexto_ia.md`. Cubre: **todos**.
