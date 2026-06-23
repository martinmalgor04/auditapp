<script lang="ts">
  import type { QueuedSave } from '$lib/client/form/retry-queue';

  interface Props {
    retryQueue?: QueuedSave[];
  }

  let { retryQueue = [] }: Props = $props();

  const isVisible = $derived(retryQueue && retryQueue.length > 0);
  const queueCount = $derived(retryQueue?.length ?? 0);
</script>

{#if isVisible}
  <div
    class="fixed bottom-4 right-4 z-40 rounded-sys-app bg-sys-amarillo px-4 py-3 text-sys-profundo shadow-lg"
    role="status"
    aria-live="polite"
    data-indicator="queue-pending"
  >
    <div class="flex items-center gap-2">
      <svg
        class="h-4 w-4 animate-spin"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      <span class="text-sm font-medium">
        Guardado pendiente… ({queueCount})
      </span>
    </div>
  </div>
{/if}

<style>
  :global([data-indicator='queue-pending']) {
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
