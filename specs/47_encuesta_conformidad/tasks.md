# Tasks — #47 47_encuesta_conformidad

> Orden de implementación. Cada paso referencia los `R<n>` que cubre.
> No empezar hasta que el spec esté aprobado por humano (puerta SDD).

## Schema y DB

- [ ] T1 — Crear `migrations/0NN_encuesta_conformidad.sql`: tabla `survey_response`
  (`id`, `share_id` FK → `audit_report_share`, `valoracion_global` smallint CHECK 1–5,
  `claridad_informe` smallint CHECK 1–5, `conforme_hallazgos` boolean, `comentario` text,
  `submitted_at` timestamptz default now()) + índice único `survey_response_share_uq` por
  `share_id`. Todo con `IF NOT EXISTS` (idempotente). Cubre: R3, R6, R8.

- [ ] T2 — Crear `src/lib/server/db/survey-responses.ts`: `SurveyResponseRow`, `mapRow`,
  `insertSurveyResponse`, `getSurveyByShareId`, `getSurveyByActiveShare(reportId)` (join al
  share activo de #15). SQL parametrizado. Cubre: R6, R8, R9.

## Dominio / schema

- [ ] T3 — Crear `src/lib/server/informe/survey.ts`: `surveyResponseSchema` (Zod `.strict`),
  `SURVEY_QUESTIONS`, tipos `SurveyEstado`/`SurveyResponseView`/`SurveyState`,
  `submitSurveyResponse({ token, raw, clientIp })` (rate limit #15 → `resolveShareByToken` →
  Zod → insert; conflicto `23505` → `already_answered`). Cubre: R4, R5, R6, R10.

- [ ] T4 — `tests/encuesta-schema.test.ts`: migración 2x sin error + índice único;
  `surveyResponseSchema` (rango, tipos, `.strict`, comentario ≤ 2000); segundo insert viola
  UNIQUE. Cubre: R3, R4, R6.

## Ruta pública (extensión #15, sin auth)

- [ ] T5 — Extender `src/routes/informe/[token]/+page.server.ts`: en `load`, añadir
  `getSurveyByShareId(share.id)` y devolver `encuesta: SurveyState` con solo campos públicos
  (nunca `share_id`/`report_id`/ids internos). Cubre: R1, R2.

- [ ] T6 — Añadir `actions.responder` en el mismo `+page.server.ts`: rate limit (R10),
  `resolveShareByToken` (R5, 404 amable si !ok), `surveyResponseSchema.safeParse` (R4, fail
  amable), `insertSurveyResponse`; conflicto → estado `respondida` (R6); éxito → `{ ok: true }`
  (R7). Cubre: R4, R5, R6, R7, R10.

- [ ] T7 — Crear `src/lib/components/informe/survey-block.svelte`: bloque branded `--sys-*`,
  no intrusivo, al pie del informe; formulario `use:enhance` (radios 1–5 ×2, toggle Sí/No,
  textarea opcional) si `pendiente`; agradecimiento + resumen read-only si `respondida` o tras
  éxito. Cubre: R1, R7.

- [ ] T8 — Extender `src/routes/informe/[token]/+page.svelte`: montar `<SurveyBlock
  state={data.encuesta} />` debajo de `ReportWebRender`. Cubre: R1.

- [ ] T9 — `tests/api/encuesta-public.test.ts`: load incluye `encuesta` (R1); payload sin
  material interno (fixture con `upsell_findings`/`internal_draft`) (R2); POST inválido no
  inserta (R4); token inválido/revocado/expirado/no aprobado → amable sin fila (R5);
  idempotencia 2º envío (R6); éxito `submitted_at` (R7, R8); ráfaga → 429 (R10). Cubre:
  R1, R2, R4, R5, R6, R7, R8, R10.

## Backoffice (extensión #15, solo admin)

- [ ] T10 — Extender `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts`:
  si admin y hay share, cargar `getSurveyByActiveShare(report.id)` → `encuesta`. Cubre: R9.

- [ ] T11 — Mostrar la respuesta (valoración, claridad, conformidad, comentario,
  `submitted_at`) o «sin respuesta aún» en `share-panel.svelte` (o `survey-result.svelte`)
  dentro de «Entrega al cliente». Cubre: R9.

- [ ] T12 — `tests/api/encuesta-admin.test.ts`: load admin devuelve la respuesta; sin
  respuesta → «sin respuesta aún»; rol no admin no la ve. Cubre: R9.

## E2E

- [ ] T13 — `e2e/encuesta-conformidad.spec.ts`: informe `aprobado` + share activo (fixture
  #14/#15, `INFORME_FAKE=1`) → abrir público → ver bloque → completar → enviar →
  agradecimiento → respuesta visible en backoffice. Cubre: R1, R7, R12.

## Cierre

- [ ] T14 — `pnpm run check` + `pnpm test` + `pnpm exec playwright test
  e2e/encuesta-conformidad.spec.ts` en verde. Mapa de trazabilidad en
  `progress/impl_47_encuesta_conformidad.md` (cada R con su test). Cubre: R11, R12.

## Trazabilidad R → Task

| R | Tasks |
|---|---|
| R1 | T5, T7, T8, T9, T13 |
| R2 | T5, T9 |
| R3 | T1, T4 |
| R4 | T3, T4, T6, T9 |
| R5 | T3, T6, T9 |
| R6 | T1, T2, T3, T6, T9 |
| R7 | T6, T7, T9, T13 |
| R8 | T1, T2, T9 |
| R9 | T2, T10, T11, T12 |
| R10 | T3, T6, T9 |
| R11 | T4, T9, T12, T14 |
| R12 | T13, T14 |
