# Impl #32 — 32_auditoria_mixta_dos_tecnicos

Asignación de auditoría por área (`audit_assignment`), form técnico filtrado por
especialidad asignada, y CAB compartido único con bloqueo tras confirmación.
NO toca scoring ni render del informe.

## Archivos

### Creados
- `migrations/020_audit_assignment.sql` — tabla `audit_assignment` (PK `(audit_id, audit_type)`,
  FK `audit_id→audit ON DELETE CASCADE`, FK `tech_id→app_user`, CHECK de `audit_type`,
  índice por `tech_id`), columnas `audit.cab_confirmed_by/at` (guarda `information_schema`),
  backfill desde `assigned_tech_id` (`unnest(types)` + `ON CONFLICT DO NOTHING`). Idempotente.
- `src/lib/server/db/audit-assignment.ts` — `listAuditAssignments`, `techAssignedTypes`,
  `insertAuditAssignments(tx, …)`, `techIsAssigned`.
- `tests/db/audit-assignment-migration.test.ts`
- `tests/backoffice/create-audit-assignment.test.ts`
- `tests/form/section-scope.test.ts`
- `tests/form/cab-lock.test.ts`
- `tests/api/report-access-assignment.test.ts`

### Modificados
- `src/lib/server/backoffice/schemas.ts` — `createAuditSchema`: `assignedTechId` → `techByType`
  (`z.record(auditTypeSchema, uuid)`) + refine "un técnico por cada tipo, sin sobrantes".
- `src/lib/server/backoffice/form-parsers.ts` — `parseTechByTypeFromForm` (`techByType[<type>]`).
- `src/lib/server/backoffice/audits.ts` — `createAudit`: validación de especialidad por tipo
  (`userCanUseAuditTypes([type], tech)`), técnico líder por orden canónico (`it<erp-tango<erp-estandar`)
  → `assigned_tech_id`, `insertAuditAssignments` en la misma tx; `listTechnicians` devuelve `auditTypes`.
- `src/routes/(app)/auditorias/new/+page.svelte` — un `<select name="techByType[<type>]">` por tipo
  seleccionado (reactivo), ofreciendo solo especialistas.
- `src/lib/server/db/audit-form.ts` — `getAuditFormHeader` agrega `cab_confirmed_by/at`;
  `listFormSections`/`listFormItems` exponen `template_id`; nueva `confirmCab(auditId, userId)` atómica.
- `src/lib/server/form/load-form.ts` — `assertFormAccess` async, por asignación efectiva;
  filtrado de secciones a templates visibles + dedup CAB canónico; estado `cab` en el retorno.
- `src/lib/server/form/complete.ts`, `export-import.ts`, `save-response.ts` — `await assertFormAccess`;
  `save-response` rechaza ítems CAB de no-confirmadores (CAB bloqueado).
- `src/routes/(app)/auditorias/[id]/form/+page.server.ts` — action `confirmCab`.
- `src/routes/(app)/auditorias/[id]/form/+page.svelte` — botón "Confirmar CAB" / banner solo-lectura.
- `src/lib/server/api/guards.ts` — `requireReportReadAccess` por asignación (`assignedTechIds`).
- `src/routes/api/audits/[id]/report/[version]/+server.ts`,
  `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts`,
  `…/informe/[version]/imprimir/+page.server.ts` — proveen `assignedTechIds` desde `listAuditAssignments`.
- Tests existentes migrados a `techByType` (no-regresión R25): `tests/audits-create.test.ts`,
  `tests/api/audit-create-flow.test.ts`, `tests/api/audit-crud.test.ts`.

## Trazabilidad R ↔ test

| R | Verificación | Test |
|---|---|---|
| R1 | tabla con PK/FK/CHECK/índice | `audit-assignment-migration` (crea tabla…) |
| R2 | backfill 2 filas por mixta | `audit-assignment-migration` (backfill) |
| R3 | idempotente, sin duplicar | `audit-assignment-migration` (re-aplicar 2×) |
| R4 | `assigned_tech_id` intacto | `audit-assignment-migration` (backfill) |
| R5 | `cab_confirmed_*` nulables | `audit-assignment-migration` (agrega cab) |
| R6 | un select por tipo | UI `new/+page.svelte` + schema/parser (`techByType`) |
| R7 | rechazo por especialidad | `create-audit-assignment` (técnico IT a tipo ERP) |
| R8 | N asignaciones en la tx | `create-audit-assignment` (mixta) |
| R9 | techs distintos por área / single 1 | `create-audit-assignment` (mixta / single) |
| R10 | lead determinístico, no nulo | `create-audit-assignment` (assignedTechId=itTech) |
| R11 | CAB + secciones del área | `section-scope` (técnico IT) |
| R12 | sin secciones ERP | `section-scope` (técnico IT, erpOnly) |
| R13 | admin ve todo | `section-scope` (admin) |
| R14 | técnico no asignado → 403 | `section-scope` (sin asignación) |
| R15 | CAB una sola vez | `section-scope` (filter CAB == 1) |
| R16 | editar y confirmar | `cab-lock` (primer técnico) |
| R17 | set atómico | `cab-lock` (confirmCab true/false) |
| R18 | edición CAB de B rechazada | `cab-lock` (B → FormItemNotAllowedError) |
| R19 | B ve valores en solo-lectura | `cab-lock` (locked, canConfirm false) |
| R20 | área propia sigue editable | `cab-lock` (B edita ERP, A edita IT) |
| R21 | sin sesión → 401 | `report-access-assignment` |
| R22 | asignado/admin OK, otro 403 | `report-access-assignment` |
| R23 | técnico asignado a algún tipo | `report-access-assignment` |
| R24 | sin tocar scoring/render | revisión `git diff` (abajo) |
| R25 | single-type sin regresión | `create-audit-assignment` + tests migrados |
| R26 | preexistente: backfill, CAB no confirmado, respuestas intactas | `audit-assignment-migration` (backfill) |

## R24 — invariante no-regresión

`git diff` NO toca `src/lib/server/scoring/`, `src/lib/scoring/`, `src/lib/informe/render*`,
ni el esquema de `audit_response`/`audit_closure`. La migración no agrega columnas de área a
respuestas (el área se deriva 1:1 del `template_id`).

## Verificación

- `pnpm run check`: 0 errores (32 warnings preexistentes `state_referenced_locally`).
- Suite #32 (5 files): 19/19 verde.
- `pnpm test`: <ver progress/current.md>.

NO se cambió el estado en `feature_list.json` (lo maneja el reviewer). NO commit/push.
