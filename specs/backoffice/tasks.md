# Tasks — backoffice

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_backoffice.md`.

**Precondición:** features `stack_scaffolding` (#1), `modelo_datos` (#2) y `auth_roles` (#3) en `done`.

## Dominio y schemas

- [ ] T1 — Crear `src/lib/server/backoffice/schemas.ts` con Zod para filtros tablero, create/update audit, template item y usuarios. Cubre: **R3, R4, R9, R10, R21**.
- [ ] T2 — Implementar `status-colors.ts` + `progress.ts` con tests unitarios. Cubre: **R5, R6**.
- [ ] T3 — Implementar `dashboard.ts` (listado, filtros, búsqueda, orden, paginación 50). Cubre: **R2, R3, R4, R7, R25**.
- [ ] T4 — Implementar `audits.ts` (create con congelar templates, update, archive). Cubre: **R9, R10, R11, R12, R13**.
- [ ] T5 — Implementar `briefing-link.ts` (generate + regenerate). Cubre: **R14, R15**.
- [ ] T6 — Implementar `users.ts` y `templates.ts` (updateItem acotado). Cubre: **R17, R18, R21, R22**.

## Layout y navegación

- [ ] T7 — Crear `(app)/+layout.server.ts` con `requireAuth` y `(app)/+layout.svelte` con nav condicional admin. Cubre: **R1, R24**.
- [ ] T8 — Redirect post-login a `/tablero` en auth (#3) si aún no existe. Cubre: **R1**.

## Tablero

- [ ] T9 — Ruta `tablero/+page.server.ts` + `+page.svelte` con filtros, búsqueda, orden y paginación. Cubre: **R2, R3, R4, R7, R25**.
- [ ] T10 — Componentes `audit-filters`, `audit-status-badge`, `audit-progress-bar`. Cubre: **R5, R6**.
- [ ] T11 — Componentes `audit-table` (desktop) y `audit-card-list` (mobile) con breakpoint `md:`. Cubre: **R8**.
- [ ] T12 — Acción copiar link briefing por fila cuando aplique. Cubre: **R16**.

## CRUD auditorías

- [ ] T13 — Ruta `auditorias/new` con `client-picker`, tipos, segmento, técnico, fecha, form CAB data-driven. Cubre: **R9, R10**.
- [ ] T14 — Ruta `auditorias/[id]` detalle/edición con progreso, acciones update/archive/briefing. Cubre: **R11, R12, R13, R14, R15, R16**.
- [ ] T15 — Validar guards: técnico puede crear/editar; solo admin archiva. Cubre: **R13, R24**.

## Usuarios (admin)

- [ ] T16 — Ruta `usuarios/` con listado, alta, edición, desactivar y reset pass. Cubre: **R17, R18**.
- [ ] T17 — Guard 403 técnico en `/usuarios`. Cubre: **R19**.

## Plantillas (admin)

- [ ] T18 — Ruta `plantillas/[id]` listando secciones e ítems; editor solo campos permitidos. Cubre: **R20, R21**.
- [ ] T19 — Rechazar endpoints/actions de alta sección/ítem. Cubre: **R22, R23**.

## Tests

- [ ] T20 — `tests/backoffice-status-badge.test.ts` y `tests/backoffice-progress.test.ts`. Cubre: **R5, R6**.
- [ ] T21 — `tests/api/backoffice-dashboard.test.ts` (list, filters, search, sort, pagination). Cubre: **R2, R3, R4, R7, R25**.
- [ ] T22 — `tests/api/audit-crud.test.ts` y `tests/api/audit-briefing-link.test.ts`. Cubre: **R9–R16**.
- [ ] T23 — `tests/api/users-admin.test.ts` y `tests/api/templates-admin.test.ts`. Cubre: **R17–R23**.
- [ ] T24 — `tests/api/backoffice-routes.test.ts` (auth redirect, guards rol). Cubre: **R1, R24**.
- [ ] T25 — `e2e/backoffice-dashboard.spec.ts` (tabla vs cards) y smoke briefing link copy. Cubre: **R8, R16**.

## Cierre

- [ ] T26 — Ejecutar `./init.sh`, `pnpm run check`, `pnpm test`. Cubre: todos.
- [ ] T27 — Documentar trazabilidad R→test en `progress/impl_backoffice.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → backoffice-routes.test.ts > unauthenticated redirect
- R2 → backoffice-dashboard.test.ts > lists audits
- R3 → backoffice-dashboard.test.ts > filters type status client
- R4 → backoffice-dashboard.test.ts > search razon_social
- R5 → backoffice-status-badge.test.ts
- R6 → backoffice-progress.test.ts
- R7 → backoffice-dashboard.test.ts > sort
- R8 → e2e/backoffice-dashboard.spec.ts
- R9 → audit-crud.test.ts > create borrador
- R10 → audit-crud.test.ts > new client
- R11 → audit-crud.test.ts > update open audit
- R12 → audit-crud.test.ts > closed forbidden
- R13 → audit-crud.test.ts > archive admin only
- R14 → audit-briefing-link.test.ts > generate
- R15 → audit-briefing-link.test.ts > regenerate
- R16 → e2e/backoffice-briefing-link.spec.ts
- R17 → users-admin.test.ts > create deactivate
- R18 → users-admin.test.ts > reset password
- R19 → users-admin.test.ts > tecnico 403
- R20 → templates-admin.test.ts > admin load
- R21 → templates-admin.test.ts > update allowed fields
- R22 → templates-admin.test.ts > reject new item
- R23 → templates-admin.test.ts > tecnico 403
- R24 → backoffice-routes.test.ts > role guards
- R25 → backoffice-dashboard.test.ts > pagination
```
