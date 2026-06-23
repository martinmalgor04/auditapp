# Tasks — 39_relevamiento_visible_reapertura

Feature: Ver relevamiento de auditorías cerradas + reapertura accesible  
Estado: pendiente de implementación (aprobación humana requerida primero)

---

## Checklist

- [x] T1 — Crear migración `NNN_audit_report_stale_since.sql` con
  `ALTER TABLE audit_report ADD COLUMN IF NOT EXISTS stale_since timestamptz DEFAULT NULL`.
  Cubre: R12, R13.

- [x] T2 — Actualizar `src/lib/server/db/informe-reports.ts`:
  agregar `stale_since: Date | null` a `AuditReportRow`, incluir en
  `REPORT_COLUMNS`, actualizar `mapRow`, agregar `markReportsStale(auditId, tx)`
  y `clearReportStale(reportId, tx)`.
  Cubre: R13, R15.

- [x] T3 — Actualizar `src/lib/server/db/audit-status.ts`: agregar opción
  `allowTechReopen` a `isValidAuditStatusTransition` para la transición
  `cerrada → en_cierre`.
  Cubre: R9.

- [x] T4 — Ampliar `reopenAudit` en `src/lib/server/scoring/persist.ts`:
  cambiar firma a `(auditId: string, user: AppUser)`, validar permiso (admin O
  `techIsAssigned`), incluir `markReportsStale` en la transacción de reapertura.
  Cubre: R9, R10, R11, R12, R13.

- [x] T5 — Agregar `assertFormReadonlyAccess` y `loadAuditFormReadonly` en
  `src/lib/server/form/load-form.ts`.
  Cubre: R1, R2, R3, R5, R6, R7.

- [x] T6 — Crear `src/routes/(app)/auditorias/[id]/form-readonly/+page.server.ts`
  que carga con `loadAuditFormReadonly` y guarda en 401/403 si no hay acceso.
  Cubre: R3, R5, R6, R7.

- [x] T7 — Crear `src/routes/(app)/auditorias/[id]/form-readonly/+page.svelte`
  que renderiza las secciones y ítems del form en modo readonly (sin controles
  de edición, sin autosave, sin botón "Relevamiento completo").
  Cubre: R3, R4.

- [x] T8 — Actualizar `src/routes/(app)/auditorias/[id]/+page.server.ts`:
  calcular `canViewRelevamientoReadonly` y `canReopenAudit` en el loader;
  serializar `stale_since` en el array `reports`; agregar action `reopenAudit`.
  Cubre: R1, R2, R8, R9, R10, R14.

- [x] T9 — Actualizar `src/routes/(app)/auditorias/[id]/+page.svelte`:
  mostrar enlace "Ver relevamiento (solo lectura)" cuando
  `data.canViewRelevamientoReadonly`; mostrar botón "Reabrir auditoría" cuando
  `data.canReopenAudit`; pasar `stale_since` a `InformeSection`.
  Cubre: R1, R8, R14.

- [x] T10 — Actualizar `src/lib/components/informe/informe-section.svelte`:
  mostrar aviso "Este informe puede estar desactualizado" cuando el informe
  tiene `stale_since !== null`.
  Cubre: R14.

- [x] T11 — Actualizar `src/lib/server/informe/pipeline.ts`: llamar
  `clearReportStale(report.id)` tras `saveDraftsAndFinish` exitoso.
  Cubre: R15.

- [x] T12 — Verificar `src/routes/(app)/auditorias/[id]/cierre/+page.server.ts`:
  la action `reopenAudit` pasa `user` (ya lo hace); confirmar que con la nueva
  firma de `reopenAudit` no hay cambios necesarios en el call site. Ajustar si
  el compilador reporta error de tipos.
  Cubre: R11.

- [ ] T13 — Escribir tests unitarios `tests/form-readonly.test.ts`:
  - `assertFormReadonlyAccess` permite admin.
  - `assertFormReadonlyAccess` permite técnico asignado.
  - `assertFormReadonlyAccess` lanza `AuditFormNotAllowedError` para técnico no asignado.
  - `loadAuditFormReadonly` no modifica `audit_response` (spy/mock de `upsertFormResponse`).
  Cubre: R2, R5, R7.

- [ ] T14 — Escribir tests unitarios `tests/reopen-audit.test.ts`:
  - `reopenAudit` transiciona `cerrada → en_cierre`.
  - `reopenAudit` llama `markReportsStale` cuando hay informes.
  - `reopenAudit` lanza `ForbiddenError` para técnico no asignado.
  - `reopenAudit` lanza `ForbiddenError` para rol no autorizado.
  - `reopenAudit` lanza `InvalidStateTransitionError` si status != `cerrada`.
  Cubre: R9, R10, R11, R13, R16.

- [ ] T15 — Escribir tests unitarios `tests/informe-stale.test.ts`:
  - `markReportsStale` escribe `stale_since` para todos los informes del audit.
  - `clearReportStale` limpia `stale_since` del informe indicado.
  - Un informe con `stale_since` previo no se sobreescribe (idempotencia del `WHERE IS NULL`).
  Cubre: R13, R15.

- [ ] T16 — Escribir test e2e `e2e/relevamiento-readonly.spec.ts`:
  - Flujo: auditoría cerrada → detalle → "Ver relevamiento" → verificar que no
    hay inputs habilitados.
  - Flujo: admin reabrir desde detalle → verificar estado `en_cierre`.
  - Flujo: técnico asignado reabrir desde detalle → verificar estado `en_cierre`.
  - Flujo: técnico NO asignado → botón reabrir no visible.
  - Verificar aviso "puede estar desactualizado" en InformeSection tras reapertura.
  Cubre: R1, R2, R4, R8, R9, R10, R14.

- [ ] T17 — Ejecutar `pnpm run check` y `pnpm test` en verde. Ejecutar
  `./init.sh` sin errores.
  Cubre: R17, R18.

---

## Mapa de trazabilidad R↔T

| Req | Tasks |
|-----|-------|
| R1  | T5, T8, T9, T16 |
| R2  | T5, T8, T9, T13, T16 |
| R3  | T5, T6, T7 |
| R4  | T7, T16 |
| R5  | T5, T6, T13 |
| R6  | T6 |
| R7  | T5, T6, T13 |
| R8  | T8, T9, T16 |
| R9  | T3, T4, T14, T16 |
| R10 | T4, T8, T14, T16 |
| R11 | T4, T12, T14 |
| R12 | T2, T4 |
| R13 | T1, T2, T4, T15 |
| R14 | T8, T9, T10, T16 |
| R15 | T2, T11, T15 |
| R16 | T14 |
| R17 | T17 |
| R18 | T17 |
