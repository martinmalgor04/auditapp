<script lang="ts">
  export type SaveIndicatorState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

  let { state, errorMessage = null }: { state: SaveIndicatorState; errorMessage?: string | null } = $props();
</script>

<p
  class="text-xs text-center min-h-[1.25rem] sticky top-0 z-20 bg-sys-offwhite py-1"
  aria-live="polite"
  data-save-state={state}
>
  {#if state === 'saving'}
    <span class="text-sys-electrico">Guardando…</span>
  {:else if state === 'saved'}
    <span class="text-emerald-600">Guardado ✓</span>
  {:else if state === 'offline'}
    <span class="text-amber-700">Sin conexión — se reintenta</span>
  {:else if state === 'error'}
    <span class="text-red-600">No se guardó: {errorMessage ?? 'error al guardar'}</span>
  {/if}
</p>
