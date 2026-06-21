# Requirements — 38_toast_error_guardado

> En el formulario técnico de auditoría, el `SaveIndicator` existe pero es
> pequeño y está fijo en un corner lejos del dedo. En campo, con conexión
> intermitente, el técnico necesita saber con certeza si los datos se
> guardaron o si hubo un error. Hoy si el guardado falla, el indicador
> cambia a "error" pero no hay forma de reintentar explícitamente ni un
> feedback claro de qué falló.

## Contexto verificado

- **`SaveIndicator`** (`src/lib/components/form/save-indicator.svelte`):
  muestra estados `idle | saving | saved | error`. Está en el form técnico
  (`/auditorias/[id]/form`).
- **Cola de reintentos:** el form tiene una cola de reintentos (`retryQueue`)
  para modo offline que reintenta automáticamente al reconectar. El estado
  `error` persiste mientras haya ítems en la cola fallida.
- **`SaveIndicator` actual:** es un elemento pequeño (texto + ícono) ubicado
  en un corner de la UI. En estado `error` no hay CTA de reintento visible.
- **Componente de tabla de inventario:** tiene su propio mini-feedback local
  (feature #26 ya implementada). Este spec es para el form general, no para
  las tablas.

## Requerimientos

### R1 — Toast de error visible al guardar

CUANDO el estado de guardado pasa a `error` (fallo en la llamada a la API),
el sistema DEBE mostrar un toast/banner visible en una posición accesible
(cerca del fondo de la pantalla, sobre la bottom nav si existe) con:
- Mensaje claro: "No se pudo guardar. Revisá tu conexión."
- Botón "Reintentar" que fuerza un nuevo intento del guardado pendiente.
- Botón o gesto para descartar el toast.

### R2 — Toast de éxito opcional (no intrusivo)

El sistema PUEDE mostrar un feedback breve al pasar de `saving` a `saved`
(p.ej. el indicador existente puesto a `saved` es suficiente). NO debe
mostrarse un toast de éxito en cada guardado — sería demasiado ruido dado
el autosave frecuente.

### R3 — Toast de estado sin conexión

CUANDO la cola de reintentos está activa (hay ítems pendientes de guardar
porque el último intento falló), el sistema DEBE mostrar un indicador persistente
de "Sin conexión — guardado pendiente" que desaparece cuando la cola se vacía.

### R4 — No interferir con el toast de InstallPWA

El toast de error DEBE coexistir con el banner de `InstallPWA.svelte`.
Si ambos están presentes, el toast de error tiene mayor prioridad (aparece
encima o desplaza el banner de instalación).

### R5 — El `SaveIndicator` existente se mantiene

El `SaveIndicator` pequeño en el corner NO se elimina — es el feedback
discreto para el estado normal (`saving` / `saved`). El toast de error
es un feedback adicional para el estado de error, no un reemplazo.

### R6 — Solo en el form técnico

Este toast aplica únicamente en la ruta `/auditorias/[id]/form`. No es un
sistema global de toasts para toda la app (eso sería over-engineering para
el scope actual).

## Trazabilidad requerida

| R | Test mínimo |
|---|---|
| R1 | Con estado `error`, existe en el DOM un elemento con texto de error y un botón de reintento |
| R1 | El botón "Reintentar" dispara el reintento del guardado |
| R3 | Con cola no vacía, existe un indicador de "pendiente" |
| R5 | `SaveIndicator` sigue renderizándose en el DOM independientemente del toast |
| R6 | El toast no aparece en ninguna ruta fuera de `/auditorias/[id]/form` |
