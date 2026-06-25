# Implementación — #47 47_encuesta_conformidad

Encuesta de conformidad propia embebida al pie del informe público (#15). Una respuesta por
share (token), inmutable. Persistencia Zod-validada; respuesta visible solo para admin.

## Archivos

| Archivo | Tipo |
|---|---|
| `migrations/025_encuesta_conformidad.sql` | nuevo |
| `src/lib/server/db/survey-responses.ts` | nuevo |
| `src/lib/server/informe/survey.ts` | nuevo |
| `src/lib/components/informe/survey-block.svelte` | nuevo (público) |
| `src/lib/components/informe/survey-result.svelte` | nuevo (backoffice) |
| `src/routes/informe/[token]/+page.server.ts` | extendido (load + action `responder`) |
| `src/routes/informe/[token]/+page.svelte` | extendido (montaje del bloque) |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` | extendido (load `encuesta`) |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte` | extendido (panel resultado) |
| `tests/encuesta-schema.test.ts` | nuevo |
| `tests/api/encuesta-public.test.ts` | nuevo |
| `tests/api/encuesta-admin.test.ts` | nuevo |
| `e2e/encuesta-conformidad.spec.ts` | nuevo |

## Trazabilidad R → test

| R | Requisito | Cobertura (test) |
|---|---|---|
| R1 | Bloque embebido + load entrega `encuesta` | `encuesta-public.test.ts` «load incluye encuesta pendiente»; `encuesta-conformidad.spec.ts` (bloque visible) |
| R2 | Nunca expone material interno | `encuesta-public.test.ts` «el payload del load no expone material interno ni ids» (fixture con `upsell_findings`/`internal_draft`, asserts negativos sobre `report_id`/`share_id`/`created_by`) |
| R3 | Migración idempotente crea tabla + índice único | `encuesta-schema.test.ts` «crea survey_response …», «la migración es idempotente: runMigrations dos veces …» |
| R4 | Validación Zod estricta | `encuesta-schema.test.ts` describe `surveyResponseSchema`; `encuesta-public.test.ts` «POST inválido no inserta fila y degrada con fail amable» |
| R5 | Guard token: solo aprobado/vigente | `encuesta-public.test.ts` «token inexistente/revocado/expirado/no aprobado → 404 amable sin fila» |
| R6 | Una respuesta por token, inmutable | `encuesta-schema.test.ts` «el índice único rechaza el segundo insert»; `encuesta-public.test.ts` «segundo POST … no crea segunda fila» |
| R7 | Confirmación amable al enviar | `encuesta-public.test.ts` «POST válido … estado respondida»; `encuesta-conformidad.spec.ts` (agradecimiento en el mismo bloque) |
| R8 | Registro de `submitted_at` | `encuesta-public.test.ts` «POST válido inserta con submitted_at …» |
| R9 | Respuesta visible en backoffice (solo admin) | `encuesta-admin.test.ts` (admin la ve; sin respuesta → pendiente; técnico no la ve) |
| R10 | Rate limit público → 429 | `encuesta-public.test.ts` «ráfaga de POST desde la misma IP termina en 429» |
| R11 | Tests unitarios/integración | `encuesta-schema.test.ts`, `encuesta-public.test.ts`, `encuesta-admin.test.ts` |
| R12 | E2E ver → responder → confirmación → backoffice | `e2e/encuesta-conformidad.spec.ts` |

## Verificación

- `pnpm run check` → 0 errores.
- `pnpm run build` → ok.
- `pnpm test` → 235 archivos, 1304 passed, 2 skipped (suites de encuesta: 19 tests en verde).
- E2E creado; corre con el stack Playwright en CI.

## Decisiones de puerta aplicadas

Set fijo 1–5 + Sí/No + comentario opcional; respuesta única e inmutable
(reenvío → `already_answered`); comentario siempre opcional; visibilidad solo admin.

## Notas

- Vínculo por `share_id` (no `report_id`): la respuesta cuelga del link que el cliente vio.
- Migración `025` (siguiente número libre en disco tras `024`).
- Pendiente: marcado a `done` lo hace el reviewer, no el implementer.
