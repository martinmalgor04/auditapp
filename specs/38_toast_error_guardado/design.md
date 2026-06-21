# Design — 38_toast_error_guardado

## Decisiones de diseño

### 1. Sin sistema global de toasts

No se introduce una librería de toasts ni un store global. El feedback de error
se implementa localmente en el componente del form (`/auditorias/[id]/form/+page.svelte`)
reactivo al estado de guardado. Fuera del form no existe.

### 2. Posicionamiento: bottom-center, sobre la bottom nav

El toast se posiciona con `fixed bottom-0 left-0 right-0` con un `padding-bottom`
que lo aleja de la bottom nav (cuando existe en mobile):

```svelte
<div class="fixed bottom-0 left-0 right-0 z-50 px-4"
     style="padding-bottom: calc(env(safe-area-inset-bottom) + 4rem)">
  <!-- card del toast -->
</div>
```

En desktop (sin bottom nav), queda justo encima del borde inferior.

### 3. Dos estados distintos: error puntual vs. sin conexión persistente

**Error puntual** (un guardado falló pero hay conexión):
- Toast rojo temporal (auto-dismiss a los 8s si no hay reintento).
- Botón "Reintentar" que llama al método de reintento manual del form.

**Sin conexión / cola pendiente** (el form tiene ítems sin guardar):
- Banner amarillo/naranja persistente mientras la cola no se vacíe.
- No tiene auto-dismiss.
- Al recuperar conexión y vaciar la cola, desaparece solo.

### 4. Implementación: leer el estado del SaveIndicator

El form ya tiene un `SaveState` derivado. Se puede pasarlo al toast como prop
o usar un store derivado. La forma más simple:

```svelte
<!-- En form/+page.svelte -->
{#if saveState === 'error'}
  <SaveErrorToast onRetry={retryManual} />
{:else if retryQueueLength > 0}
  <SavePendingBanner count={retryQueueLength} />
{/if}
```

Donde `retryManual` es la función que ya existe en el form para forzar reintentos,
y `retryQueueLength` es el length de la cola de reintentos.

### 5. Componente `SaveErrorToast.svelte`

Nuevo componente en `src/lib/components/form/`:

```
fixed bottom-0 left-0 right-0 z-50
  └── div.sys-card (borde rojo, sombra)
       ├── ícono ⚠ rojo
       ├── "No se pudo guardar. Revisá tu conexión."
       └── [Reintentar] [✕]
```

El botón `✕` llama a una función `onDismiss` que suprime el toast hasta el
próximo error (no suprime el SaveIndicator).

---

## Archivos a modificar / crear

- `src/lib/components/form/save-error-toast.svelte` — nuevo
- `src/lib/components/form/save-pending-banner.svelte` — nuevo (o inline en el form)
- `src/routes/(app)/auditorias/[id]/form/+page.svelte` — integrar los dos
  nuevos componentes, exponer `retryManual` y `retryQueueLength`

---

## Verificación de la cola de reintentos

Antes de implementar, leer `form/+page.svelte` para entender exactamente
cómo está implementada la cola (`retryQueue`) y cómo se dispara un reintento
manual, para conectarlo correctamente al botón "Reintentar".
