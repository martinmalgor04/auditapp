# Tasks — #57 57_backoffice_mutation_scope

> No implementar hasta aprobación humana. Detalle: `plans/02_backoffice_mutation_scope.md`.

- [x] T1 — Agregar `assertAdminOrAssigned(auditId, user)` (en
  `+page.server.ts` o `backoffice/audits.ts`) usando `techIsAssigned` +
  `ForbiddenError`. Cubre: R3, R5, R8.

- [x] T2 — Action `archive`: `requireAdmin` (y opcional
  `ADMIN_ONLY_ACTIONS`). Invertir test `'tecnico can archive audits'` →
  cannot (403); mantener admin OK. Cubre: R1, R2, R9.

- [x] T3 — Action `update`: tras `requireStaff`, `assertAdminOrAssigned`
  antes de `updateAudit`. Test técnico no asignado → 403; asignado → OK.
  Cubre: R3, R4, R9.

- [x] T4 — Actions `generateBriefingLink`, `regenerateBriefingLink`,
  `completarBriefingInternamente`: mismo assert. Tests 403/OK. Cubre: R5,
  R6, R9.

- [x] T5 — Verificar no-regresión `enviarBriefingEmail` / `reopenAudit`
  (tests existentes verdes). Cubre: R7.

- [x] T6 — Gates: `pnpm run check` y `pnpm test`. Cubre: R9.
