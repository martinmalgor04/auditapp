<script lang="ts">
  export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

  let { state }: { state: SaveState } = $props();
</script>

<p class="text-xs text-center min-h-[1.25rem]" aria-live="polite">
  {#if state === 'saving'}
    <span class="text-sys-electrico">Guardando…</span>
  {:else if state === 'saved'}
    <span class="text-emerald-600">Guardado</span>
  {:else if state === 'error'}
    <span class="text-red-600">Error al guardar</span>
  {/if}
</p>
