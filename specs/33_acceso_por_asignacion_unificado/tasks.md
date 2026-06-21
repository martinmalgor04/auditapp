# Tasks — 33_acceso_por_asignacion_unificado

> No empezar sin aprobación humana. Verificar con `pnpm run check`, `pnpm test`,
> `./init.sh` al terminar.

## T1 — Ampliar `getAuditForReport` (R1)

En `src/lib/server/informe/access.ts`:
- Agregar `assignedTechIds: string[]` al tipo `AuditForReport`.
- Extender la query SQL con subarray de `audit_assignment.tech_id` (o un JOIN
  con `ARRAY_AGG`), mapeando a `assignedTechIds` en el objeto retornado.
- Cubre: R1.

## T2 — Corregir página de detalle (R4, R5, R6)

En `src/routes/(app)/auditorias/[id]/+page.server.ts`:
- En el `load()`, después de `getAuditById`, llamar a
  `listAuditAssignments(audit.id)` y construir `assignedTechIds: string[]`.
- Reemplazar `audit.assignedTechId === user.id` en el filtro de versiones de
  informe por `assignedTechIds.includes(user.id)`.
- Reemplazar `audit.assignedTechId !== null && audit.assignedTechId === user.id`
  en `canEditVisita` por `assignedTechIds.includes(user.id)`.
- Cubre: R4, R5, R6.

## T3 — Verificar endpoint report version (R2)

En `src/routes/api/audits/[id]/report/[version]/+server.ts`:
- Confirmar que `getAuditForReport` (ya ampliada en T1) entrega
  `assignedTechIds` y que `requireReportReadAccess` los recibe sin cambio
  adicional.
- Si el caller ya pasa `audit` directo al guard, no hay código extra; de lo
  contrario ajustar el llamado.
- Cubre: R2.

## T4 — Verificar endpoint HTML download (R3)

En `src/routes/api/audits/[id]/report/[version]/html/+server.ts`:
- Mismo patrón que T3: confirmar que `requireReportReadAccess` recibe `audit`
  con `assignedTechIds` de `getAuditForReport`.
- Cubre: R3.

## T5 — Tests (R1–R7)

En `tests/api/report-access-assignment.test.ts` (ampliar el existente):
- Setup: auditoría mixta IT+ERP con dos técnicos distintos; informe `aprobado`.
- T5a: técnico no-líder (asignado solo por área) → 200 en `GET report/[version]` (R2).
- T5b: técnico no-líder → 200 en `GET report/[version]/html` (R3).
- T5c: técnico sin asignación → 403 en ambos endpoints (R6).
- T5d: admin → 200 en ambos endpoints (R7).

En `tests/api/audit-detail-access.test.ts` (nuevo o ampliar):
- T5e: técnico no-líder → `canEditVisita = true` y ve versiones de informe en
  el loader de la página detalle (R4, R5).
- T5f: técnico sin asignación → `canEditVisita = false` y sin versiones (R6).
- Cubre: R1–R7.

## T6 — Cierre y verificación

- `pnpm run check` — sin errores de tipos.
- `pnpm test` — todos los tests verdes.
- `./init.sh` — gate del harness verde.
- Confirmar que `imprimir/+page.server.ts` y `assertFormAccess` NO se tocaron (R9).
- Cubre: R8, R9.

## Trazabilidad R ↔ tarea

| R | Tareas |
|---|---|
| R1 | T1, T5 |
| R2 | T3, T5 |
| R3 | T4, T5 |
| R4 | T2, T5 |
| R5 | T2, T5 |
| R6 | T2, T5 |
| R7 | T5 |
| R8 | T6 |
| R9 | T6 |
