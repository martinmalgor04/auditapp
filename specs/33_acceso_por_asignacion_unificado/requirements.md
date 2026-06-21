# Requirements — 33_acceso_por_asignacion_unificado

> Follow-up de #32. La asignación por área (`audit_assignment`) quedó implementada
> para el form técnico y el guard del informe, pero tres call-sites de la página de
> detalle y de descarga siguen usando `audit.assignedTechId` (el técnico líder) como
> fuente de verdad. Un técnico asignado a un área en una mixta (no líder) recibe 403
> en: (1) descarga HTML del informe, (2) listado de versiones del informe, y (3)
> detalle de auditoría (no ve sesiones de reunión ni botón "Editar visita").
> El acceso sigue siendo fail-closed (nadie ve lo que no le corresponde).

## Contexto verificado

- `src/lib/server/informe/access.ts` — `getAuditForReport()` solo devuelve
  `assignedTechId: string | null` (un FK); no incluye los técnicos asignados por
  área desde `audit_assignment`.
- `src/lib/server/api/guards.ts` — `requireReportReadAccess()` ya acepta
  `assignedTechIds?: string[]` opcional; si se pasa, lo combina con
  `assignedTechId`. El bug está en que los callers no lo pasan.
- `src/routes/(app)/auditorias/[id]/+page.server.ts` — líneas `audit.assignedTechId
  === user.id` en el filtro de versiones de informe y en `canEditVisita`; ambos
  excluyen al técnico no-líder asignado.
- `src/routes/api/audits/[id]/report/[version]/+server.ts` — llama
  `requireReportReadAccess(locals, audit, report)` donde `audit` proviene de
  `getAuditForReport()` (sin `assignedTechIds`); ya importa
  `listAuditAssignments` pero no lo usa aquí.
- `src/routes/api/audits/[id]/report/[version]/html/+server.ts` — idéntico
  al caso anterior: llama `requireReportReadAccess` con el mismo `audit` incompleto.
- `src/lib/server/db/audit-assignment.ts` — `listAuditAssignments(auditId)` y
  `techIsAssigned(auditId, techId)` ya existen (#32).

## Requerimientos

**R1** — `getAuditForReport()` DEBE devolver también `assignedTechIds: string[]`
(lista de `tech_id` de todas las filas de `audit_assignment` para esa auditoría),
cargado en la misma función o en un wrapper que la llame junto con
`listAuditAssignments`.

**R2** — CUANDO el endpoint `GET /api/audits/[id]/report/[version]` llama a
`requireReportReadAccess`, el sistema DEBE pasar `assignedTechIds` desde
`getAuditForReport()` para que el guard evalúe asignación efectiva.

**R3** — CUANDO el endpoint `GET /api/audits/[id]/report/[version]/html` llama a
`requireReportReadAccess`, el sistema DEBE pasar `assignedTechIds` desde
`getAuditForReport()`.

**R4** — CUANDO la página `(app)/auditorias/[id]` filtra versiones de informe para
un técnico, el sistema DEBE autorizar por asignación efectiva (`listAuditAssignments`
o `assignedTechIds`) en lugar de `audit.assignedTechId === user.id`.

**R5** — CUANDO la página `(app)/auditorias/[id]` calcula `canEditVisita`, el
sistema DEBE autorizar por asignación efectiva en lugar de
`audit.assignedTechId === user.id`.

**R6** — El sistema NO DEBE exponer versiones de informe ni habilitar `canEditVisita`
a un técnico sin asignación efectiva en la auditoría (sigue siendo fail-closed).

**R7** — El acceso de admin NO DEBE modificarse: un admin sigue viendo todo sin
restricción de asignación.

**R8** — El link público de informe (`/informe/[token]`) NO DEBE verse afectado.

**R9** — El form técnico (`assertFormAccess`, `#32 R14`) y el guard de impresión
(`imprimir/+page.server.ts`, `#32 R23`) NO DEBEN modificarse (ya usan asignación
efectiva).

## Trazabilidad requerida

| R | Test mínimo |
|---|---|
| R1 | `getAuditForReport` devuelve `assignedTechIds` con todos los técnicos de `audit_assignment` |
| R2 | Técnico no-líder asignado por área → 200 en `GET /api/audits/[id]/report/[version]` |
| R3 | Técnico no-líder asignado por área → 200 en `GET /api/audits/[id]/report/[version]/html` |
| R4 | Técnico no-líder asignado por área → ve versiones de informe en página detalle |
| R5 | Técnico no-líder asignado por área → `canEditVisita = true` en página detalle |
| R6 | Técnico sin asignación → 403 en los tres endpoints; `canEditVisita = false` |
| R7 | Admin → 200 en todos los endpoints sin importar asignación |
