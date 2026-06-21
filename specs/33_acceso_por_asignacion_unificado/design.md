# Design — 33_acceso_por_asignacion_unificado

## Diagnóstico preciso

El problema está en la cadena de datos de la página de detalle y los endpoints
de informe. El guard `requireReportReadAccess` ya soporta `assignedTechIds`
opcionales (#32), pero los tres callers le pasan el objeto `audit` que viene de
`getAuditForReport()`, cuya query SQL solo lee `assigned_tech_id` (el líder).

No hay cambio de lógica: solo hay que enriquecer el dato que llega al guard.

---

## Cambios por archivo

### `src/lib/server/informe/access.ts`

Extender `AuditForReport` con `assignedTechIds: string[]` y hacer que
`getAuditForReport()` las cargue:

```ts
// Opción A (preferida): join inline
SELECT a.id, a.status, a.assigned_tech_id, a.started_at, a.finished_at,
       COALESCE(
         ARRAY(SELECT tech_id FROM audit_assignment WHERE audit_id = a.id),
         '{}'::uuid[]
       ) AS assigned_tech_ids
FROM audit a WHERE a.id = $1 AND a.archived_at IS NULL

// Opción B: segundo SELECT + call a listAuditAssignments()
// Descartada: dos round-trips innecesarios para un dato simple.
```

El campo `assignedTechIds` se mapea desde `assigned_tech_ids` (array PostgreSQL).

### `src/routes/(app)/auditorias/[id]/+page.server.ts`

Tres usos de `audit.assignedTechId === user.id` a corregir:

1. **Filtro de versiones de informe** (auditoría cerrada):
   ```ts
   // Antes:
   : audit.assignedTechId === user.id
     ? all.filter((r) => r.status === 'aprobado')
     : [];
   // Después:
   : audit.assignedTechIds.includes(user.id)
     ? all.filter((r) => r.status === 'aprobado')
     : [];
   ```

2. **`canEditVisita`**:
   ```ts
   // Antes:
   const canEditVisita = isAdmin || (audit.assignedTechId !== null && audit.assignedTechId === user.id);
   // Después:
   const canEditVisita = isAdmin || audit.assignedTechIds.includes(user.id);
   ```

`getAuditById` (en `src/lib/server/backoffice/audits.ts`) también retorna
`assignedTechId` — verificar si ya expone una lista o si esta función también
necesita ampliarse. Si la página de detalle ya usa `audit` de `getAuditById`
(que tiene su propio tipo `AuditRow`), entonces hay que:
- Opción A: extender `getAuditById`/`AuditRow` igual que `getAuditForReport`.
- Opción B: en el `load()` de la página, llamar adicionalmente a
  `listAuditAssignments(audit.id)` y derivar el set de IDs.

Preferir Opción B en `+page.server.ts` para no tocar el tipo `AuditRow` que
tiene muchos callers.

### `src/routes/api/audits/[id]/report/[version]/+server.ts`

Ya importa `listAuditAssignments`. Solo necesita enriquecer el `audit` antes de
llamar a `requireReportReadAccess`:

```ts
const audit = await getAuditForReport(params.id!);
// audit.assignedTechIds ya viene de la query ampliada (R1)
// → pasa directo al guard sin cambio adicional
```

### `src/routes/api/audits/[id]/report/[version]/html/+server.ts`

Mismo patrón: después de ampliar `getAuditForReport`, el `audit` ya trae
`assignedTechIds` y se pasa directo a `requireReportReadAccess`. No hay código
adicional salvo asegurarse de no eliminar el campo.

---

## Sin migración SQL

`audit_assignment` ya existe desde #32. No se requiere ninguna migración.

---

## Alternativa descartada

**Agregar `assignedTechIds` como segundo parámetro en cada caller** (en vez de
enriquecer `getAuditForReport`): genera duplicación y riesgo de olvidar futuros
callers. Centralizar en la función de carga es más robusto.
