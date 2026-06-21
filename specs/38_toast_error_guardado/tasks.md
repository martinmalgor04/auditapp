# Tasks — 38_toast_error_guardado

## T1 — Leer el form actual
Leer `src/routes/(app)/auditorias/[id]/form/+page.svelte` para mapear:
- Cómo se deriva `saveState` (idle/saving/saved/error)
- Cómo funciona la `retryQueue` (length, cómo se dispara un reintento manual)
- Dónde está el `<SaveIndicator>` para no eliminarlo

## T2 — Crear `SaveErrorToast.svelte`
En `src/lib/components/form/save-error-toast.svelte`:
- Props: `onRetry: () => void`, `onDismiss: () => void`
- Fixed bottom-center, z-50, sobre bottom nav
- Mensaje de error + botón Reintentar + botón cerrar
- Auto-dismiss opcional a los 8s

## T3 — Crear `SavePendingBanner.svelte`
En `src/lib/components/form/save-pending-banner.svelte`:
- Prop: `count: number` (ítems pendientes)
- Persistente mientras `count > 0`
- Color naranja/amarillo, texto "Guardado pendiente — sin conexión"

## T4 — Integrar en el form
En `src/routes/(app)/auditorias/[id]/form/+page.svelte`:
- Agregar estado `toastDismissed` local
- Renderizar `<SaveErrorToast>` cuando `saveState === 'error' && !toastDismissed`
- Renderizar `<SavePendingBanner>` cuando `retryQueueLength > 0`
- Conectar `onRetry` al método de reintento existente
- Confirmar que `<SaveIndicator>` sigue en su lugar

## T5 — Verificación
- Simular error de red (DevTools → Network → offline) y guardar un campo:
  confirmar que aparece el toast rojo.
- Hacer click en "Reintentar": confirmar que intenta guardar de nuevo.
- Al reconectar: confirmar que el banner de pendientes desaparece.
- Confirmar que el `SaveIndicator` pequeño sigue visible.
- `pnpm run check` → 0 errores nuevos.
