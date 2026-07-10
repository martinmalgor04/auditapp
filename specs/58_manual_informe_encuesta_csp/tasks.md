# Tasks — #58 58_manual_informe_encuesta_csp

> No implementar hasta aprobación humana. Detalle: `plans/03_manual_informe_encuesta_csp.md`.

- [x] T1 — Reescribir `buildSurveyBlock` en `manual-serve.ts` con controles
  1–5 y `true`/`false` (referencia `survey-block.svelte`). Eliminar enums
  legacy. Cubre: R1, R2.

- [x] T2 — Test de inyección: assert values 1–5 / true|false; ausencia de
  `muy_satisfecho`. Opcional: `safeParse` del schema sobre el form. Cubre:
  R1, R2, R3, R9.

- [x] T3 — Reescribir `insertManualReport` atómico (TX+FOR UPDATE o
  INSERT…SELECT MAX+1). Cubre: R4.

- [x] T4 — En `manual/+server.ts`, mapear unique `23505` → `apiError(..., 409)`.
  Test de concurrencia o conflicto. Cubre: R5, R9.

- [x] T5 — Headers: `X-Content-Type-Options: nosniff` + comentario threat
  model; no agregar CSP restrictivo. Test de headers. Cubre: R6, R7, R8, R9.

- [x] T6 — Gates: `pnpm run check` y `pnpm test` (incl.
  `encuesta-schema.test.ts` sin cambios de schema). Cubre: R3, R9.
