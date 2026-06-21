# Trazabilidad — #34 34_briefing_opcional

Implementado 2026-06-21 por implementer.

## R ↔ test

| R | Descripción | Test |
|---|---|---|
| R1 | Transición desde `borrador` → `briefing_completo` sin generar `public_token` | T4a en `tests/backoffice/completar-briefing-internamente.test.ts` |
| R2 | Transición desde `briefing_enviado` → `briefing_completo` sin invalidar `public_token` | T4b en `tests/backoffice/completar-briefing-internamente.test.ts` |
| R3 | Rechazo desde estados inválidos (`briefing_completo`, `en_relevamiento`, etc.) | T4c, T4d en `tests/backoffice/completar-briefing-internamente.test.ts` |
| R4 | Requiere rol `staff` (acción usa `requireStaff`) | Action `completarBriefingInternamente` en `+page.server.ts` |
| R5 | Botón visible en `borrador` | `+page.svelte` — bloque `{#if data.audit.status === 'borrador'}` |
| R6 | Botón visible en `briefing_enviado` | `+page.svelte` — bloque `{#if data.audit.status === 'briefing_enviado'}` |
| R7 | Briefing externo sin cambios | `tests/briefing-token.test.ts`, `tests/briefing-form.test.ts`, `tests/briefing-validation.test.ts` — todos verdes |
| R8 | Scoring, render de informe y cierre no modificados | Sin tocar esos módulos (verificado) |

## Archivos creados/modificados

- `src/lib/server/backoffice/briefing-link.ts` — función `completarBriefingInternamente` agregada al final
- `src/routes/(app)/auditorias/[id]/+page.server.ts` — import + action `completarBriefingInternamente`
- `src/routes/(app)/auditorias/[id]/+page.svelte` — botón en sección Briefing (borrador y briefing_enviado)
- `tests/backoffice/completar-briefing-internamente.test.ts` — nuevo, 4 tests T4a–T4d

## Archivos NO tocados (confirmado)

- `src/routes/briefing/` — sin cambios
- `src/lib/server/db/audit-form.ts` — sin cambios
- Scoring, render, cierre — sin cambios
