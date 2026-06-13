# Impl #17 — 17_contexto_ia

Feature: contexto enriquecido fase 2 (RAG Tango + catálogo SyS + few-shot).
Migración: `009_contexto_ia.sql`. Prompt base: `2.0` con sufijos `+rag`, `+catalogo`, `+fewshot`.

## Trazabilidad R → test

| Req | Descripción | Test(s) |
|-----|-------------|---------|
| R1 | Flags env `=== '1'` independientes | `tests/informe-context.test.ts` — resolveContextConfig |
| R2 | Pipeline intacto sin enriquecimiento | `tests/informe-pipeline.test.ts` — flags off no invocan fuentes |
| R3 | RAG por similitud, no dump | `tests/informe-rag.test.ts` — buildRagQueries, retriever mock umbral |
| R4 | Mapeo seccion_code → módulo Tango | `tests/informe-rag.test.ts` — SECCION_TO_MODULO, modulo null |
| R5 | Embeddings Gemini + RPC match_documents | `tests/informe-rag.test.ts` — fetch mock embeddings/RPC |
| R6 | Fallback RAG sin bloquear generación | `tests/informe-pipeline.test.ts` — throw/timeout → borrador + rag.error |
| R7 | Presupuesto tokens RAG | `tests/informe-context.test.ts` — trimToBudget, chunks similitud |
| R8 | Catálogo versionado Zod strict | `tests/informe-catalogo.test.ts` |
| R9 | Catálogo solo salida interna | `tests/informe-prompt.test.ts` — bloque catalogo_sys, regla sin producto cerrado |
| R10 | Endpoint ejemplar admin | `tests/api/informe-ejemplar.test.ts` — 200/409/403/401 |
| R11 | Few-shot ejemplares recientes | `tests/informe-fewshot.test.ts` — selección, recorte, vacío |
| R12 | prompt_version con sufijos | `tests/informe-prompt.test.ts` — resolvePromptVersion combinaciones |
| R13 | context_meta jsonb persistido | `tests/informe-pipeline.test.ts`, `tests/informe-context.test.ts` — schema |
| R14 | Presupuesto total prompt | `tests/informe-context.test.ts` — orden recorte, canónico gigante |
| R15 | Deps inyectables, tests sin red | `tests/informe-pipeline.test.ts`, `tests/informe-rag.test.ts` |
| R16 | Env documentado | `tests/informe-context.test.ts` — claves en `.env.example` |

## Archivos nuevos

- `migrations/009_contexto_ia.sql`
- `src/lib/server/informe/context/{config,tokens,schemas,build}.ts`
- `src/lib/server/informe/rag/{queries,retriever}.ts`
- `src/lib/server/informe/catalogo/catalogo-sys.ts`
- `src/lib/server/informe/fewshot/select.ts`
- `src/routes/api/audits/[id]/report/[version]/ejemplar/+server.ts`
- `tests/informe-{context,rag,catalogo,fewshot}.test.ts`
- `tests/api/informe-ejemplar.test.ts`

## Archivos modificados

- `src/lib/server/db/informe-reports.ts` — ejemplar, context_meta, setEjemplar, listEjemplarReports
- `src/lib/server/informe/pipeline.ts` — buildInformeContext, deps inyectables
- `src/lib/server/informe/prompts/generate-report.ts` — v2.0, bloques contexto
- `src/routes/(app)/auditorias/[id]/informe/[version]/+page.{server.ts,svelte}` — toggle ejemplar
- `.env.example` — 14 variables #17
- `tests/informe-prompt.test.ts`, `tests/informe-pipeline.test.ts`

## Verificación

```
./init.sh → exit 0 (540 tests passed, 2 skipped)
pnpm run check → OK
```

## Notas

- Default embedding model: `gemini-embedding-001` (env `RAG_GEMINI_EMBEDDING_MODEL`).
- Catálogo v1 con rangos orientativos SyS (Tango, HPE/Lenovo/Dell, Sophos, soporte, SysDesk).
- Todo el contexto off por defecto; pipeline #14 compatible sin env extra.
