# Review — feature 04_backoffice (#4)

**Veredicto:** APPROVED  
**Fecha:** 2026-06-09  
**Reviewer:** reviewer agent

## Resumen

Backoffice autenticado bajo `(app)/`: tablero con filtros/búsqueda/orden/paginación, CRUD auditorías, links de briefing, ABM usuarios (admin), editor mínimo de plantillas (admin), layout responsive tabla/cards. 30 tests nuevos en `tests/api/` + `tests/backoffice-*` (115 vitest total). 2 e2e backoffice verdes. `./init.sh` exit 0 en revisión.

## Trazabilidad

- R1: [x] `tests/api/backoffice-routes.test.ts > unauthenticated GET /tablero returns 302 to login`
- R2: [x] `tests/api/backoffice-dashboard.test.ts > lists audits with required columns`
- R3: [x] `tests/api/backoffice-dashboard.test.ts > filters by type, status and client`
- R4: [x] `tests/api/backoffice-dashboard.test.ts > search matches client razon_social`
- R5: [x] `tests/backoffice-status-badge.test.ts > maps each audit status to a distinct badge variant`
- R6: [x] `tests/backoffice-progress.test.ts > na counts as completed; empty response does not`
- R7: [x] `tests/api/backoffice-dashboard.test.ts > sorts by scheduled_at and by last activity`
- R8: [x] `e2e/backoffice-dashboard.spec.ts > desktop shows table; mobile shows cards`
- R9: [x] `tests/api/audit-crud.test.ts > create audit sets borrador and freezes template_ids`
- R10: [x] `tests/api/audit-crud.test.ts > create with new client persists client row`
- R11: [x] `tests/api/audit-crud.test.ts > update header and reassign tech when not closed`
- R12: [x] `tests/api/audit-crud.test.ts > update on closed audit returns 403 or 409`
- R13: [x] `tests/api/audit-crud.test.ts > archive sets archived_at; audit hidden from tablero`
- R14: [x] `tests/api/audit-briefing-link.test.ts > generate token transitions to briefing_enviado`
- R15: [x] `tests/api/audit-briefing-link.test.ts > regenerate invalidates previous token`
- R16: [x] `e2e/backoffice-briefing-link.spec.ts > copy briefing URL action present when token exists`; `tests/api/audit-briefing-link.test.ts > copy briefing URL action returns URL when token exists`
- R17: [x] `tests/api/users-admin.test.ts > admin can create and deactivate user`
- R18: [x] `tests/api/users-admin.test.ts > reset password updates hash; login with new password succeeds`
- R19: [x] `tests/api/users-admin.test.ts > tecnico GET /usuarios returns 403`
- R20: [x] `tests/api/templates-admin.test.ts > admin can load template editor`
- R21: [x] `tests/api/templates-admin.test.ts > update allowed fields persists; rejects new item or section`
- R22: [x] `tests/api/templates-admin.test.ts > update allowed fields persists; rejects new item or section` (createSection/createItem → 404)
- R23: [x] `tests/api/templates-admin.test.ts > tecnico GET /plantillas/[id] returns 403`
- R24: [x] `tests/api/backoffice-routes.test.ts > role guards block tecnico from admin routes`; `> tecnico cannot archive audits`; suites CRUD con guards
- R25: [x] `tests/api/backoffice-dashboard.test.ts > returns page size limit and next cursor`

## Tasks

- T1–T6: [x] Dominio y schemas (dashboard, audits, briefing-link, users, templates, progress, status-colors)
- T7–T8: [x] Layout `(app)/` + redirect post-login
- T9–T12: [x] Tablero, componentes filtros/badge/progress, tabla/cards responsive, copiar link
- T13–T15: [x] CRUD auditorías new/[id], guards admin/técnico
- T16–T17: [x] Usuarios admin + guard 403 técnico
- T18–T19: [x] Plantillas admin + rechazo alta sección/ítem
- T20–T25: [x] Tests API, unitarios y e2e
- T26–T27: [x] init.sh/check/test verdes; trazabilidad en `impl_04_backoffice.md`

## Checkpoints

- C1: [x] Arnés completo; `./init.sh` exit 0 (115 vitest)
- C2: [x] Una feature `in_progress` → cerrada `done`; tests verdes
- C3: [x] SQL parametrizado en `src/lib/server/backoffice/*` (`orderClause` allowlist + `sql.unsafe` solo para ORDER BY); sin `console.log` ni TODOs en backoffice; secretos solo env
- C4: [x] `tests/api/` + `tests/backoffice-*` cubren dominio; 115/115 vitest; 2/2 e2e backoffice verdes
- C5: [x] Sesión documentada; entrada añadida a `history.md`
- C6: [x] Spec EARS en `specs/04_backoffice/`; tasks `[x]`; R1–R25 con ≥1 test

## Acceptance (feature_list.json)

| Criterio | Estado |
|---|---|
| Tablero con filtros tipo/estado/cliente, búsqueda, badges, % avance | OK |
| CRUD auditorías: crear cabecera+plantilla+técnico, editar, borrado lógico | OK |
| Generar/regenerar link briefing (`public_token`) | OK |
| ABM usuarios técnicos/admins, reset contraseña (solo admin) | OK |
| Editor plantillas: solo edición ítems existentes | OK |
| Layout responsive: tabla desktop, cards mobile | OK |
| Tests de rutas backoffice pasan | OK (115 vitest + 2 e2e) |

## Cambios requeridos

Ninguno.
