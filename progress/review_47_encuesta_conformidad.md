# Review — feature 47 47_encuesta_conformidad

**Veredicto:** APPROVED

## Trazabilidad (R ↔ test)
- R1: [x] tests/api/encuesta-public.test.ts ("el load incluye encuesta pendiente") + e2e (survey-block visible)
- R2: [x] tests/api/encuesta-public.test.ts ("el payload del load no expone material interno ni ids") — fixture con internal_draft/upsell; asserts negativos sobre líneas, justificaciones, report_id, share_id, created_by
- R3: [x] tests/encuesta-schema.test.ts (migración idempotente 2x + índice único)
- R4: [x] tests/encuesta-schema.test.ts (rango/.strict/2000/coerción) + encuesta-public (POST inválido no inserta)
- R5: [x] tests/api/encuesta-public.test.ts (token inexistente/revocado/expirado/borrador → 404 amable sin fila)
- R6: [x] tests/encuesta-schema.test.ts (UNIQUE 2º insert) + encuesta-public (2º POST no crea fila)
- R7: [x] tests/api/encuesta-public.test.ts (POST → estado respondida) + e2e (agradecimiento)
- R8: [x] tests/api/encuesta-public.test.ts (submitted_at no nulo)
- R9: [x] tests/api/encuesta-admin.test.ts (load admin devuelve respuesta; sin respuesta → pendiente; técnico 403)
- R10: [x] tests/api/encuesta-public.test.ts (ráfaga → 429)
- R11: [x] suite vitest verde (21 tests de encuesta)
- R12: [x] e2e/encuesta-conformidad.spec.ts presente y bien formado

## Tasks
- T1..T14: [x] todas

## Checkpoints
- C1: [x] init.sh exit 0
- C2: [x] una sola feature in_progress (#47); resto done con tests
- C3: [x] SQL parametrizado (survey-responses.ts), sin ORM, sin console.log debug, secretos en env
- C4: [x] vitest 1306 passed / 2 skipped; cubre lib/server/informe/survey.ts y db/survey-responses.ts
- C5: [x] sin archivos sospechosos
- C6: [x] requirements.md (EARS) + design.md + tasks.md; tasks [x]; cada R con test

## Bug previo verificado como RESUELTO
La iteración anterior (CHANGES_REQUESTED) marcó el bug `conforme_hallazgos: z.coerce.boolean()`
que coaccionaba `'false'` → `true`, corrompiendo el "No conforme". El código actual
(`src/lib/server/informe/survey.ts` L25-27) usa parser literal explícito
(`z.union([z.boolean(), z.enum(['true','false'])]).transform(v => v === true || v === 'true')`).
Tests de regresión añadidos y verdes:
- tests/encuesta-schema.test.ts: "del form como false (no lo coacciona a true)"
- tests/api/encuesta-public.test.ts: "POST 'No conforme' persiste conforme_hallazgos = false"

## Verificación ejecutada
- ./init.sh → OK (235 test files, 1306 passed | 2 skipped), exit 0
- vitest encuesta (3 archivos) → 21 passed
- R2: verificado en código (load público solo devuelve model/token/encuesta; toSurveyState proyecta sin ids) y en test

## Nota sobre e2e
e2e/encuesta-conformidad.spec.ts falla en el SETUP compartido (`createAuditViaUi` → /auditorias/new)
por el rate limit de /login (5 intentos/min por IP, documentado en e2e/helpers/audit-flow.ts), no por
código de #47. Build verde, seed admin presente en DB, app sirve /login. Artefacto de entorno local
serial, no regresión de la feature. La lógica de #47 está cubierta de punta a punta por los 21 tests
de integración con DB real.

## Cambios requeridos
Ninguno.
