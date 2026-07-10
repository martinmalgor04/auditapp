# Requirements — 57_backoffice_mutation_scope

> Cerrar IDOR/privilege escalation en mutaciones del detalle de auditoría
> (auditoría 2026-07-10, findings S2/S5/N2). El `load` filtra por viewer, pero
> actions `update` / `archive` / briefing generate|regenerate|completar solo
> usan `requireStaff`. Contraste: `sendBriefingEmail` ya exige admin o
> asignado. Plan: `plans/02_backoffice_mutation_scope.md`.

## Contexto verificado

- `src/routes/(app)/auditorias/[id]/+page.server.ts` — actions problemáticas.
- `src/lib/server/backoffice/audits.ts` — `updateAudit` sin viewer;
  `archiveAudit` ignora rol.
- `src/lib/server/backoffice/briefing-email.ts` — patrón correcto a copiar.
- UI: botón archive solo si `data.isAdmin` (bypass vía POST directo).
- Test a invertir: `tests/api/backoffice-routes.test.ts` —
  `'tecnico can archive audits'`.

## Fuera de alcance

- Storage IDOR (#56).
- Informe manual / encuesta (#58).
- Cambiar scope de `getAuditById` por tipos (ya existe para load).
- Rediseño UI de briefing (endurecer solo server).

## Requerimientos

**R1** — CUANDO un usuario invoca la action `archive` sobre una auditoría, el
sistema DEBE exigir rol `admin` (`requireAdmin` o equivalente).

**R2** — SI un técnico (no admin) invoca `archive` ENTONCES el sistema DEBE
responder con fallo HTTP 403 (sin archivar ni redirect a tablero).

**R3** — CUANDO un usuario invoca la action `update`, el sistema DEBE exigir
rol `admin` O `techIsAssigned(auditId, user.id)`.

**R4** — SI un técnico no asignado invoca `update` ENTONCES el sistema DEBE
responder 403 sin persistir cambios de segmento/técnico/CAB/fechas.

**R5** — CUANDO un usuario invoca `generateBriefingLink`,
`regenerateBriefingLink` o `completarBriefingInternamente`, el sistema DEBE
exigir admin O `techIsAssigned` (misma semántica que `sendBriefingEmail`).

**R6** — SI un técnico no asignado invoca cualquiera de las actions de R5
ENTONCES el sistema DEBE responder 403 sin mutar `public_token` ni status.

**R7** — El sistema NO DEBE degradar los guards ya correctos de
`enviarBriefingEmail` y `reopenAudit` (no-regresión).

**R8** — El sistema DEBE evaluar asignación con `techIsAssigned` (multi-tipo),
NO solo `assignedTechId === user.id`.

**R9** — El sistema DEBE cubrir R1–R6 con tests de API/actions: invertir el
caso «técnico puede archivar»; agregar negativos 403 y positivos admin/asignado.

## Acceptance

- Archive solo admin (UI + server).
- Update y briefing links: admin o técnico asignado.
- Tests backoffice-routes actualizados y verdes.
- `techIsAssigned` como fuente de verdad de asignación.
