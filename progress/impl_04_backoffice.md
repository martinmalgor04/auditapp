# Implementación — #4 04_backoffice

**Fecha:** 2026-06-09  
**Agente:** implementer

## Resumen

Backoffice autenticado bajo `(app)/`: tablero con filtros/búsqueda/orden/paginación, CRUD auditorías, links de briefing, ABM usuarios (admin), editor mínimo de plantillas (admin), layout responsive tabla/cards.

## Trazabilidad

- R1 → `tests/api/backoffice-routes.test.ts` > unauthenticated GET /tablero returns 302 to login
- R2 → `tests/api/backoffice-dashboard.test.ts` > lists audits with required columns
- R3 → `tests/api/backoffice-dashboard.test.ts` > filters by type, status and client
- R4 → `tests/api/backoffice-dashboard.test.ts` > search matches client razon_social
- R5 → `tests/backoffice-status-badge.test.ts` > maps each audit status to a distinct badge variant
- R6 → `tests/backoffice-progress.test.ts` > na counts as completed; empty response does not
- R7 → `tests/api/backoffice-dashboard.test.ts` > sorts by scheduled_at and by last activity
- R8 → `e2e/backoffice-dashboard.spec.ts` > desktop shows table; mobile shows cards
- R9 → `tests/api/audit-crud.test.ts` > create audit sets borrador and freezes template_ids
- R10 → `tests/api/audit-crud.test.ts` > create with new client persists client row
- R11 → `tests/api/audit-crud.test.ts` > update header and reassign tech when not closed
- R12 → `tests/api/audit-crud.test.ts` > update on closed audit returns 403 or 409
- R13 → `tests/api/audit-crud.test.ts` > archive sets archived_at; audit hidden from tablero
- R14 → `tests/api/audit-briefing-link.test.ts` > generate token transitions to briefing_enviado
- R15 → `tests/api/audit-briefing-link.test.ts` > regenerate invalidates previous token
- R16 → `e2e/backoffice-briefing-link.spec.ts` > copy briefing URL action present when token exists
- R17 → `tests/api/users-admin.test.ts` > admin can create and deactivate user
- R18 → `tests/api/users-admin.test.ts` > reset password updates hash; login with new password succeeds
- R19 → `tests/api/users-admin.test.ts` > tecnico GET /usuarios returns 403
- R20 → `tests/api/templates-admin.test.ts` > admin can load template editor
- R21 → `tests/api/templates-admin.test.ts` > update allowed fields persists; rejects new item or section
- R22 → `tests/api/templates-admin.test.ts` > POST new section or item returns 404 or 403
- R23 → `tests/api/templates-admin.test.ts` > tecnico GET /plantillas/[id] returns 403
- R24 → `tests/api/backoffice-routes.test.ts` > role guards block tecnico from admin routes
- R25 → `tests/api/backoffice-dashboard.test.ts` > returns page size limit and next cursor

## Archivos principales

- Migración: `migrations/002_backoffice.sql` (`audit.archived_at`)
- Dominio: `src/lib/server/backoffice/*`
- UI: `src/lib/components/backoffice/*`
- Rutas: `src/routes/(app)/{tablero,auditorias,usuarios,plantillas}/`
- Tests API: `tests/api/*.test.ts`, `tests/backoffice-*.test.ts`
- E2E: `e2e/backoffice-*.spec.ts`, `e2e/ensure-audit.ts`

## Verificación

- `./init.sh` — OK (115 tests vitest)
- `pnpm run check` — OK
- `pnpm exec playwright test` — OK (3 e2e)
