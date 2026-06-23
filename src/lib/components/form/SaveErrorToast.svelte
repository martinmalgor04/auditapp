<script lang="ts">
  interface Props {
    saveState?: string;
    errorMessage?: string | null;
    onretry?: () => void;
    onclose?: () => void;
  }

  let { saveState, errorMessage = null, onretry, onclose }: Props = $props();

  // Toast solo se muestra cuando saveState === 'error'
  const isVisible = $derived(saveState === 'error');
</script>

{#if isVisible}
  <div
    class="fixed bottom-16 right-4 z-50 md:bottom-4 max-w-sm rounded-sys-app bg-sys-rojo px-4 py-3 text-white shadow-lg"
    role="alert"
    data-toast="save-error"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1">
        <p class="text-sm font-medium">
          {errorMessage ?? 'No se pudo guardar. Revisá tu conexión.'}
        </p>
      </div>
      {#if onclose}
        <button
          type="button"
          onclick={onclose}
          class="shrink-0 text-white/70 hover:text-white transition-colors"
          aria-label="Cerrar alerta"
        >
          ×
        </button>
      {/if}
    </div>
    <div class="mt-3 flex gap-2">
      {#if onretry}
        <button
          type="button"
          class="inline-flex items-center rounded-sys-app bg-white/20 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/30"
          onclick={onretry}
        >
          Reintentar
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  :global([data-toast='save-error']) {
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
