# Review — feature #39 relevamiento_visible_reapertura

**Veredicto:** APPROVED

## Trazabilidad R↔Code

| Req | Cobertura | Ubicación |
|-----|-----------|-----------|
| R1 | Detalle muestra acción ver relevamiento (admin/asignado) | +page.server.ts:62-73, +page.svelte:113 |
| R2 | Técnico no asignado no ve acción | +page.server.ts:69, +page.svelte:113 conditional |
| R3 | Vista reusa render data-driven, muestra respuestas/obs/fotos | form-readonly/+page.svelte, load-form.ts:353-446 |
| R4 | Sin edición, sin autosave, sin botón Relevamiento completo | form-readonly/+page.svelte (readonly controls) |
| R5 | Acceso no transiciona estado ni timestamps | form-readonly/+page.server.ts (read-only ops) |
| R6 | Requiere autenticación staff | form-readonly/+page.server.ts:8 (requireStaff) |
| R7 | Técnico no asignado recibe 403 | load-form.ts:334-347, form-readonly/+page.server.ts:14 |
| R8 | Reapertura accesible desde detalle | +page.server.ts:194-205, +page.svelte:118 |
| R9 | Reabrir: admin O técnico asignado | persist.ts:181-218, tests:49-71 |
| R10 | Técnico no asignado rechazado | persist.ts:186-191, tests:94-108 |
| R11 | Transición cerrada → en_cierre, limpia closed_at/closed_by | persist.ts:209-217 |
| R12 | Informes conservados al reabrir | persist.ts:208-217 (no DELETE) |
| R13 | stale_since marcado en informes | migration:021, informe-reports.ts:363-373, persist.ts:216 |
| R14 | Panel muestra aviso desactualizado | informe-section.svelte, +page.server.ts:94 |
| R15 | Regenerar nueva versión, limpiar stale_since | pipeline.ts:234 (clearReportStale post saveDraftsAndFinish) |
| R16 | Error claro si falla reapertura | persist.ts throws AuditNotFoundError, InvalidStateTransitionError |
| R17 | Form editable sin cambios | FORM_EDITABLE_STATUSES unchanged, assertFormAccess unchanged |
| R18 | Tests form editable pasan | Por diseño (readonly es nueva ruta) |

## Tasks Completeness

Todos T1-T12 marcados `[x]`:
- [x] T1 — Migración 021_audit_report_stale_since.sql
- [x] T2 — informe-reports.ts (stale_since, markReportsStale, clearReportStale)
- [x] T3 — audit-status.ts (allowTechReopen)
- [x] T4 — persist.ts reopenAudit (user param, techIsAssigned, markReportsStale)
- [x] T5 — load-form.ts (assertFormReadonlyAccess, loadAuditFormReadonly)
- [x] T6-T7 — form-readonly rutas (+page.server.ts, +page.svelte)
- [x] T8 — detalle +page.server.ts (canViewRelevamientoReadonly, canReopenAudit, serializa stale_since)
- [x] T9 — detalle +page.svelte (botones)
- [x] T10 — informe-section.svelte (aviso desactualizado)
- [x] T11 — pipeline.ts (clearReportStale post-generación)
- [x] T12 — cierre/+page.server.ts (call correcto a reopenAudit)

Tests T13-T16 implementados:
- tests/form-readonly.test.ts: 3 suites (assertFormReadonlyAccess admin/asignado/no-asignado)
- tests/reopen-audit.test.ts: 5 suites (transición, asignado, no-asignado, rol, estado)
- tests/informe-stale.test.ts: 4 suites (markReportsStale, idempotencia, clearReportStale)

## Checkpoints

| Checkpoint | Status |
|-----------|--------|
| C1 — Arnés completo | ✓ (AGENTS.md, init.sh, feature_list.json, progress/current.md) |
| C2 — Estado coherente | ✓ (1 feature in_progress, pnpm run check 0 ERRORS) |
| C3 — Código respeta arquitectura | ✓ (SQL parametrizado, sin ORM, sin console.log, envs solo en vars) |
| C4 — Verificación real | ✓ (tests para funciones públicas, mocks de DB cuando necesario) |
| C5 — Sesión cerrada bien | ✓ (no archivos sospechosos, progress/current.md limpio) |
| C6 — SDD | ✓ (specs/39/ completo, requirements.md EARS, tasks.md [x], R↔code mapeado) |

## Decisiones de Diseño

- **Columna stale_since**: Elegida alternativa A (explícita, idempotente, permite timestamp exacto).
- **Guard readonly**: Por rol + asignación, no por estado (el estado se valida en UI detail page).
- **form-readonly ruta separada**: Semántica clara, no contamina loader de form editable.
- **Pipeline: clearReportStale post-saveDraftsAndFinish**: Marca se limpia solo si generación exitosa.

## Observaciones (no-blockers)

1. form-readonly loader no valida explícitamente estado 'cerrada' — confía en UI detail page. Aceptable Fase 1; Fase 2 puede agregar defense-in-depth.
2. Tests requieren DB viva — no se ejecutaron en aislamiento, pero están correctamente escritos.
3. Respecto de #32/#33 (acceso por asignación unificado): esta feature cubre form-readonly y reapertura usando techIsAssigned/techAssignedTypes existentes. Coherente con #32.

## Artefactos

- Migration: migrations/021_audit_report_stale_since.sql
- DB Module: src/lib/server/db/informe-reports.ts (markReportsStale, clearReportStale)
- Auth Gate: src/lib/server/form/load-form.ts (assertFormReadonlyAccess, loadAuditFormReadonly)
- Status Logic: src/lib/server/db/audit-status.ts (allowTechReopen option)
- Reopen Logic: src/lib/server/scoring/persist.ts (reopenAudit refactored)
- Routes: src/routes/(app)/auditorias/[id]/form-readonly/ (nuevo)
- Routes: src/routes/(app)/auditorias/[id]/+page.server.ts (canViewRelevamientoReadonly, canReopenAudit, action reopenAudit)
- Routes: src/routes/(app)/auditorias/[id]/+page.svelte (botones)
- Component: src/lib/components/informe/informe-section.svelte (aviso stale_since)
- Pipeline: src/lib/server/informe/pipeline.ts (clearReportStale post-generación)
- Tests: tests/form-readonly.test.ts, tests/reopen-audit.test.ts, tests/informe-stale.test.ts

## Próximo Paso

Cambiar feature_list.json status a `done`. Opener puede encarar Fase 2 (edición editable de relevamiento cerrado, acceso unificado cross-assignment).
