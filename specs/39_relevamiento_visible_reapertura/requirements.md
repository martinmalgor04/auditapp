# Requirements — 39_relevamiento_visible_reapertura

Feature: Ver relevamiento de auditorías cerradas + reapertura accesible  
Estado objetivo: `spec_ready`  
Fecha: 2026-06-22

---

## Contexto

Hoy, con una auditoría en estado `cerrada`, el relevamiento es inaccesible:
`canOpenForm` y `FORM_EDITABLE_STATUSES` excluyen `cerrada`; el form arroja
`AuditFormNotEditableError` (409) y el detalle no muestra ningún botón para
ver el contenido relevado. Esta feature habilita:

1. **Vista de solo lectura** del relevamiento desde el detalle de la auditoría
   cuando está `cerrada`.
2. **Reapertura** accesible y ampliada: visible desde el detalle (no solo desde
   `/cierre`), disponible para admin y técnico asignado (hoy solo admin), y
   consciente de los informes ya generados.

Alcance Fase 1: solo lectura + reapertura + marca de informe desactualizado.  
Fuera de alcance: edición del relevamiento estando cerrada, inventario editable,
cambios al scoring, cambios al render del informe salvo la marca.

---

## Requisitos

### Acceso de solo lectura al relevamiento

**R1** — CUANDO un usuario con rol `admin` o `tecnico` asignado accede al
detalle de una auditoría en estado `cerrada`, el sistema DEBE mostrar una acción
(enlace o botón) para ver el relevamiento en modo solo lectura.

**R2** — CUANDO un `tecnico` no asignado a la auditoría accede al detalle de
una auditoría `cerrada`, el sistema NO DEBE mostrar la acción de ver el
relevamiento.

**R3** — CUANDO un usuario autorizado (R1) activa la vista de solo lectura del
relevamiento de una auditoría `cerrada`, el sistema DEBE renderizar el mismo
contenido data-driven que el form técnico (#07): secciones, ítems, respuestas
actuales, observaciones y fotos.

**R4** — MIENTRAS la auditoría está `cerrada` y el relevamiento se muestra en
modo solo lectura, el sistema NO DEBE presentar controles de edición de ítems
(inputs, selects, textareas de respuesta), botón "Relevamiento completo", ni
acciones de autosave.

**R5** — CUANDO se carga la vista de solo lectura del relevamiento de una
auditoría `cerrada`, el sistema NO DEBE modificar el estado de la auditoría,
ni `started_at`, ni `finished_at`, ni ninguna fila de `audit_response`.

**R6** — CUANDO un usuario no autenticado o sin rol `staff` intenta acceder a
la ruta de solo lectura del relevamiento de una auditoría `cerrada`, el sistema
DEBE responder con HTTP 401 o redirigir al login.

**R7** — CUANDO un `tecnico` autenticado pero no asignado a la auditoría
intenta acceder directamente (URL) a la vista de solo lectura, el sistema DEBE
responder con HTTP 403.

---

### Reapertura desde el detalle

**R8** — CUANDO una auditoría está en estado `cerrada`, el sistema DEBE mostrar
una acción de reapertura en la página de detalle de la auditoría
(`/auditorias/[id]`), visible para usuarios con permiso de reapertura (R9).

**R9** — El sistema DEBE permitir reabrir una auditoría `cerrada` a un usuario
con rol `admin` O a un `tecnico` que esté asignado a ≥1 tipo de la auditoría.

**R10** — CUANDO un `tecnico` no asignado intenta reabrir una auditoría
`cerrada`, el sistema DEBE rechazar la acción con HTTP 403.

**R11** — CUANDO se ejecuta la acción de reapertura de una auditoría `cerrada`,
el sistema DEBE transicionar el estado de `cerrada` a `en_cierre`, limpiar
`closed_at` y `closed_by` en `audit_closure`, tal como lo hace la
implementación actual de `reopenAudit`.

**R12** — CUANDO se ejecuta la acción de reapertura de una auditoría `cerrada`
con informe(s) ya generados en `audit_report`, el sistema DEBE conservar todos
los informes existentes sin modificar su contenido, status ni versión.

**R13** — CUANDO se ejecuta la acción de reapertura de una auditoría `cerrada`
con al menos un informe en `audit_report`, el sistema DEBE marcar dichos
informes como potencialmente desactualizados mediante una columna
`stale_since timestamptz` (NULL = vigente, NOT NULL = desactualizado desde esa
fecha).

**R14** — CUANDO se muestra el panel interno del informe en el detalle de la
auditoría, el sistema DEBE mostrar un aviso visible para cada informe cuyo
`stale_since` no sea NULL, indicando que el informe puede estar desactualizado
respecto del relevamiento actual.

**R15** — CUANDO se regenera el informe en una auditoría reabierta y luego
re-cerrada, el sistema DEBE insertar una nueva versión del informe (versión
N+1) sin borrar las versiones anteriores, y DEBE limpiar `stale_since` de las
versiones anteriores al completar la nueva generación exitosamente.

**R16** — SI la acción de reapertura falla (auditoría no encontrada o estado
inválido), el sistema DEBE devolver un mensaje de error claro sin cambiar el
estado de la auditoría.

---

### No regresión del flujo editable

**R17** — MIENTRAS la auditoría está en un estado editable
(`briefing_completo`, `en_relevamiento`, `en_cierre`), el sistema DEBE
comportarse exactamente igual que antes de esta feature: `assertFormAccess`
lanza `AuditFormNotEditableError` para estados no editables, y el form editable
no presenta ningún aviso de solo lectura.

**R18** — CUANDO se ejecutan los tests del form editable existentes
(vitest/playwright), el sistema DEBE pasar sin modificaciones en los casos que
no involucran estado `cerrada`.

---

## Trazabilidad aceptances → requisitos

| Acceptance (feature_list.json) | Requisitos |
|---|---|
| Detalle ofrece acción ver relevamiento (admin y técnico asignado) | R1, R2 |
| Vista reusa render data-driven #07, muestra respuestas/obs/fotos/grilla, sin edición | R3, R4 |
| Acceso no transiciona estado ni toca timestamps ni audit_response | R5 |
| Reapertura accesible desde detalle | R8 |
| Reabrir: admin y técnico asignado; técnico no asignado no puede | R9, R10 |
| Informe se conserva al reabrir, se marca desactualizado | R12, R13, R14 |
| Re-cerrar: regenerar nueva versión sin perder anterior | R15 |
| Form editable sigue igual (no regresión) | R17, R18 |
| Tests: solo-lectura no edita, guards, marca desactualizado, no-regresión | R5, R7, R10, R13, R14, R17 |
