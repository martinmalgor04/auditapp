# Tasks — 32_auditoria_mixta_dos_tecnicos

> Orden de implementación. Cada tarea referencia `R<n>` de `requirements.md`.
> No empezar hasta aprobación humana (spec_ready → in_progress). Verificación:
> `pnpm run check`, `pnpm test`, `./init.sh`.
>
> **Decisiones de la puerta humana (2026-06-18) ya incorporadas:** asignación por
> área (un técnico por `audit_type`, tabla `audit_assignment`); un solo informe
> unificado con índices IT/ERP separados (sin tocar scoring ni render); CAB
> compartido único, editable por el primer técnico y bloqueado al confirmarlo.
>
> **Pendiente de confirmar en la puerta antes de T1 (ver Open Questions):** el
> modelado de "CAB confirmado" como columnas `audit.cab_confirmed_by/at`
> (propuesta del autor; design.md §6).

## Fase 1 — Migración (datos)

- [x] T1 — Crear `migrations/020_audit_assignment.sql` (idempotente, sin
  auto-registro en `schema_migration`): tabla `audit_assignment (audit_id,
  audit_type, tech_id, created_at)` con PK `(audit_id, audit_type)`, FK
  `audit_id→audit ON DELETE CASCADE`, FK `tech_id→app_user`, CHECK de
  `audit_type`; índice por `tech_id`; columnas `audit.cab_confirmed_by`/
  `cab_confirmed_at` con guarda `information_schema`. Cubre: R1, R5.
- [x] T2 — En esa migración, backfill: `INSERT … SELECT a.id, unnest(a.types),
  a.assigned_tech_id FROM audit a WHERE assigned_tech_id IS NOT NULL ON CONFLICT
  (audit_id, audit_type) DO NOTHING`. No tocar `assigned_tech_id`. Cubre: R2,
  R4, R26.

## Fase 2 — Capa de datos

- [x] T3 — Crear `src/lib/server/db/audit-assignment.ts`:
  `listAuditAssignments(auditId)`, `techAssignedTypes(auditId, techId)`,
  `insertAuditAssignments(tx, auditId, assignments)`, `techIsAssigned(auditId,
  techId)`. Cubre: R8, R11, R14, R22, R23.

## Fase 3 — Alta de auditoría (un técnico por tipo)

- [x] T4 — En `src/lib/server/backoffice/schemas.ts`, cambiar
  `createAuditSchema`: reemplazar `assignedTechId` por `techByType:
  z.record(auditTypeSchema, uuid)` + refine "un técnico por cada tipo
  seleccionado, sin sobrantes". Cubre: R6, R7.
- [x] T5 — En `src/lib/server/backoffice/form-parsers.ts`, parsear inputs
  `techByType[<type>]` a `Record<AuditType,string>`. Cubre: R6.
- [x] T6 — En `src/lib/server/backoffice/audits.ts` `createAudit()`: validar por
  tipo con `userCanUseAuditTypes([type], tech)` (rechazo `ValidationError` si
  falla, sin crear nada); elegir `assigned_tech_id` = técnico del tipo líder
  (orden canónico determinístico); insertar la auditoría e
  `insertAuditAssignments(tx, …)` en la misma tx. Cubre: R7, R8, R9, R10.
- [x] T7 — En `audits.ts` `listTechnicians()`: devolver también `audit_types`
  por técnico; y en `new/+page.server.ts` exponerlo a la vista. Cubre: R6.
- [x] T8 — En `src/routes/(app)/auditorias/new/+page.svelte`: reemplazar el
  `<select name="assignedTechId">` único por un `<select
  name="techByType[<type>]">` por cada tipo seleccionado (reactivo a los
  checkboxes `types`), ofreciendo solo técnicos con esa especialidad. Cubre: R6.

## Fase 4 — Form técnico (filtrado por especialidad)

- [x] T9 — En `src/lib/server/form/load-form.ts` `assertFormAccess()`: para
  técnico, exigir `techAssignedTypes(audit.id, user.id).length > 0` (403 si
  vacío), reemplazando el chequeo de overlap `auditMatchesUserScope`; admin sin
  restricción. Cubre: R14, R22.
- [x] T10 — En `load-form.ts` + `src/lib/server/db/audit-form.ts`: calcular
  `visibleTypes` (admin → `audit.types`; técnico → asignados) →
  `visibleTemplateIds` con `resolveTemplateIdsForTypes`; filtrar secciones a esos
  templates **más** una única sección `CAB` canónica (dedup por `code='CAB'`). El
  admin sigue viendo todas. Cubre: R11, R12, R13, R15.

## Fase 5 — CAB compartido: bloqueo

- [x] T11 — En `load-form.ts`: devolver estado `cab = { locked, confirmedBy,
  canConfirm }` (locked = `cab_confirmed_at` no nulo y usuario ≠ confirmador y no
  admin). Cubre: R16, R19.
- [x] T12 — En `src/routes/(app)/auditorias/[id]/form/+page.server.ts`: agregar
  action/endpoint `confirmCab` que, validando técnico asignado/admin, haga
  `UPDATE audit SET cab_confirmed_by, cab_confirmed_at = now() WHERE id = $id AND
  cab_confirmed_at IS NULL` (atómico, idempotente). Cubre: R17.
- [x] T13 — En el guardado de respuestas del form (action/endpoint que escribe
  `audit_response`): SI el ítem pertenece a la sección `CAB` Y el CAB está
  confirmado Y el usuario no es `cab_confirmed_by` ni admin ENTONCES ignorar/
  rechazar esa respuesta (no escribir); las secciones de área se guardan normal.
  Cubre: R18, R20.
- [x] T14 — En `src/routes/(app)/auditorias/[id]/form/+page.svelte`: cuando
  `cab.canConfirm`, mostrar botón "Confirmar CAB"; cuando `cab.locked`, presentar
  el CAB en solo-lectura con sus valores y sin acción de confirmar. Cubre: R16,
  R19.

## Fase 6 — Guard de informes

- [x] T15 — En `src/lib/server/api/guards.ts` `requireReportReadAccess`:
  autorizar al técnico si está asignado a algún tipo de la auditoría (vía
  `assignedTechIds`/`techIsAssigned`), manteniendo informe `aprobado`. En el
  loader del informe (`…/informe/[version]/+page.server.ts`) proveer los
  `assignedTechIds` desde `listAuditAssignments`. Cubre: R23.

## Fase 7 — Tests

- [x] T16 — `tests/db/audit-assignment-migration.test.ts`: aplicar `020` sobre
  fixture con auditoría `types={it,erp-tango}` + `assigned_tech_id` → 2 filas
  `audit_assignment`; correr la migración 2 veces sin error ni duplicados;
  verificar `assigned_tech_id` intacto y `cab_confirmed_*` nulos. Cubre: R1, R2,
  R3, R4, R5, R26.
- [x] T17 — `tests/backoffice/create-audit-assignment.test.ts`: alta mixta válida
  → N asignaciones (una por tipo) en la misma tx; techs distintos por área;
  `assigned_tech_id` no nulo (lead). Asignar técnico IT a tipo ERP → rechazo, sin
  auditoría. Single-type → 1 asignación sin regresión. Cubre: R7, R8, R9, R10,
  R25.
- [x] T18 — `tests/form/section-scope.test.ts`: técnico IT en auditoría mixta →
  `sections` = CAB + IT (sin ERP); admin → todas; técnico sin asignación → 403
  en `loadAuditForm`. Cubre: R11, R12, R13, R14, R15.
- [x] T19 — `tests/form/cab-lock.test.ts`: CAB no confirmado → primer técnico
  edita y confirma (set atómico); CAB confirmado por A → edición CAB por B (≠A,
  ≠admin) ignorada, B ve valores confirmados en solo-lectura; B sigue editando su
  área. Cubre: R16, R17, R18, R19, R20.
- [x] T20 — `tests/api/report-access-assignment.test.ts`: técnico asignado a
  algún tipo accede al informe `aprobado`; técnico no asignado → 403; sin sesión
  → 401. Cubre: R21, R22, R23.

## Fase 8 — Cierre

- [x] T21 — Mapa de trazabilidad `R<n> ↔ test` en `progress/impl_32_*.md`;
  confirmar que el diff NO toca `src/lib/server/scoring/`, `src/lib/scoring/`,
  `src/lib/informe/render*`, ni el esquema de `audit_response`/`audit_closure`
  (R24). Correr `pnpm run check`, `pnpm test`, `./init.sh` verdes. Cubre: R24.

## Trazabilidad R ↔ tarea

| R | Tareas |
|---|---|
| R1 | T1, T16 |
| R2 | T2, T16 |
| R3 | T1, T16 |
| R4 | T2, T16 |
| R5 | T1, T16 |
| R6 | T4, T5, T7, T8 |
| R7 | T4, T6, T17 |
| R8 | T3, T6, T17 |
| R9 | T6, T17 |
| R10 | T6, T17 |
| R11 | T3, T10, T18 |
| R12 | T10, T18 |
| R13 | T10, T18 |
| R14 | T3, T9, T18 |
| R15 | T10, T18 |
| R16 | T11, T14, T19 |
| R17 | T12, T19 |
| R18 | T13, T19 |
| R19 | T11, T14, T19 |
| R20 | T13, T19 |
| R21 | T20 |
| R22 | T3, T9, T20 |
| R23 | T3, T15, T20 |
| R24 | T21 |
| R25 | T17 |
| R26 | T2, T16 |
```
