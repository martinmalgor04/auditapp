# Tasks — 34_briefing_opcional

> No empezar sin aprobación humana. Verificar con `pnpm run check`, `pnpm test`,
> `./init.sh` al terminar.

## [x] T1 — Función `completarBriefingInternamente` (R1, R2, R3)

En `src/lib/server/backoffice/briefing-link.ts`:
- Agregar `completarBriefingInternamente(auditId: string): Promise<void>`.
- Reutilizar `getAuditForBriefing(auditId)`.
- Validar `status IN ('borrador', 'briefing_enviado')`; si no, lanzar
  `InvalidStateTransitionError` con mensaje descriptivo.
- `UPDATE audit SET status = 'briefing_completo' WHERE id = $auditId`.
  No tocar `public_token`.
- Cubre: R1, R2, R3.

## [x] T2 — Action en página de detalle (R4)

En `src/routes/(app)/auditorias/[id]/+page.server.ts`:
- Importar `completarBriefingInternamente` desde `briefing-link.ts`.
- Agregar action `completarBriefingInternamente` que llama `requireStaff` y
  luego la función del T1.
- Cubre: R4.

## [x] T3 — Botón en UI (R5, R6)

En `src/routes/(app)/auditorias/[id]/+page.svelte`:
- En la sección "Briefing":
  - Cuando `audit.status === 'borrador'`: agregar form con button
    `?/completarBriefingInternamente` debajo del "Generar link".
  - Cuando `audit.status === 'briefing_enviado'`: agregar el mismo form/button.
  - Cuando `audit.status === 'briefing_completo'` o posterior: no mostrar el
    botón (ya no aplica).
- Cubre: R5, R6.

## [x] T4 — Tests (R1–R4, R7)

En `tests/backoffice/completar-briefing-internamente.test.ts` (nuevo):
- T4a: auditoría en `borrador` → acción → estado `briefing_completo`,
  `public_token` queda nulo (R1).
- T4b: auditoría en `briefing_enviado` (con token) → acción → estado
  `briefing_completo`, `public_token` intacto (R2).
- T4c: auditoría en `briefing_completo` → acción → error, estado sin cambio (R3).
- T4d: auditoría en `en_relevamiento` → acción → error (R3).

Verificar que los tests del briefing externo existentes siguen verdes (R7).
Cubre: R1, R2, R3, R4, R7.

## [x] T5 — Cierre y verificación

- `pnpm run check` — sin errores de tipos.
- `pnpm test` — todos verdes.
- `./init.sh` — gate verde.
- Confirmar que scoring, render de informe, y `/briefing/[token]` NO se tocaron
  (R7, R8).
- Cubre: R7, R8.

## Trazabilidad R ↔ tarea

| R | Tareas |
|---|---|
| R1 | T1, T4 |
| R2 | T1, T4 |
| R3 | T1, T4 |
| R4 | T2, T4 |
| R5 | T3 |
| R6 | T3 |
| R7 | T4, T5 |
| R8 | T5 |
