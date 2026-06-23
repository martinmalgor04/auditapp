# Requirements — #40 Snapshot local del relevamiento (recuperación offline)

## Contexto

El técnico llena el form en `/auditorias/[id]/form`. El autosave hace PATCH por ítem y, si falla la
red, encola en `retry-queue` (IndexedDB, store `form_retry_queue`). Si el técnico **cierra o
recarga el tab antes de que la cola se vacíe**, esos cambios se pierden. Esta feature mantiene un
snapshot completo del form en IndexedDB para que el trabajo se pueda recuperar.

---

## Requirements

### Almacenamiento del draft

**R1** — El sistema DEBE mantener un object store `form_draft` en la base de datos IndexedDB
`auditapp_form`, con clave primaria `auditId` y valor con forma
`{ auditId: string; savedAt: string; responses: Record<string, { value: unknown; na: boolean; notes: string | null }> }`.

**R2** — CUANDO `scheduleSave` sea invocado con los valores actuales de un campo, el sistema DEBE
escribir o actualizar el documento del draft correspondiente en `form_draft` con el mapa completo de
respuestas del form en ese instante (incluyendo las que aún están en la retry-queue sin flush),
independientemente del outcome del PATCH al servidor.

**R3** — El sistema DEBE actualizar el campo `savedAt` del draft con el timestamp ISO 8601 en UTC
en cada escritura.

**R4** — SI la escritura del draft falla (por ejemplo, cuota de almacenamiento excedida), ENTONCES
el sistema NO DEBE interrumpir el flujo de autosave ni mostrar un error al técnico; DEBE registrar
el fallo en `console.warn`.

### Limpieza del draft

**R5** — CUANDO una respuesta de un ítem sea confirmada como guardada en el servidor (outcome
`saved`) Y la retry-queue para ese `auditId` quede vacía, el sistema DEBE eliminar el draft de
`form_draft` para ese `auditId`.

**R6** — CUANDO el técnico descarte el draft a través de la acción de descarte, el sistema DEBE
eliminar el draft de `form_draft` para ese `auditId`.

### Detección al cargar el form

**R7** — CUANDO el form de relevamiento sea montado, el sistema DEBE consultar `form_draft` para
verificar si existe un draft con el mismo `auditId`.

**R8** — CUANDO exista un draft en `form_draft` para el `auditId` activo, el sistema DEBE mostrar
un banner de recuperación visible que informe la fecha y hora del draft (formateada como fecha/hora
local).

**R9** — El banner de recuperación DEBE ofrecer dos acciones: **Restaurar borrador** y **Descartar**.

**R10** — MIENTRAS el banner de recuperación esté visible, el sistema NO DEBE aplicar
automáticamente el draft sobre el estado del form.

### Restauración del draft

**R11** — CUANDO el técnico confirme la acción **Restaurar borrador**, el sistema DEBE aplicar los
valores del draft sobre el estado en memoria del form, sobreescribiendo los valores cargados desde
el servidor para los ítems presentes en el draft.

**R12** — CUANDO el draft sea restaurado, el sistema DEBE marcar todos los ítems restaurados como
dirty para que el autosave normal los persista al servidor en los próximos ciclos. Para ítems de
tipo inmediato (`bool`, `tri`, `select`, `multiselect`, `date`, `datetime`, `number`, `money`),
el autosave al restaurar DEBE usar el debounce estándar (`AUTOSAVE_DEBOUNCE_MS`) en lugar de 0 ms,
para evitar una ráfaga de PATCHes simultáneos al completar la restauración.

**R13** — CUANDO el draft sea restaurado, el sistema NO DEBE disparar un PATCH inmediato; la
persistencia al servidor DEBE quedar en manos del autosave normal. Esto aplica incluso para los
tipos de campo que normalmente son de autosave 0 ms (ver R12).

**R14** — CUANDO el draft sea restaurado, el sistema DEBE ocultar el banner de recuperación.

### Descarte del draft

**R15** — CUANDO el técnico confirme la acción **Descartar**, el sistema DEBE eliminar el draft de
`form_draft` (equivalente a R6) y DEBE ocultar el banner de recuperación.

**R16** — CUANDO el draft sea descartado, el form DEBE continuar mostrando los valores cargados
desde el servidor sin modificación.

### Diferenciación con retry-queue

**R17** — El draft snapshot DEBE ser independiente de la retry-queue: la existencia de un draft NO
implica que haya ítems en la retry-queue, ni viceversa.

**R18** — El sistema DEBE actualizar el draft incluyendo ítems que aún no hayan podido enviarse al
servidor (pendientes en la retry-queue), de forma que el draft refleje el estado visual completo
del form.

### Fuera de alcance

**R19** — El sistema NO DEBE intentar persistir binarios de fotos (campo `file_ref`) dentro del
draft; el valor almacenado para esos ítems DEBE ser el valor serializable ya presente en el estado
del form (referencia de key R2, o null si no existe).

**R20** — El sistema NO DEBE requerir ningún cambio en el schema de base de datos Postgres ni en
las migraciones SQL para implementar esta feature.
