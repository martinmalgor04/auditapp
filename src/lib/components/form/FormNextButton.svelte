<script lang="ts">
  export let pendingCount: number;
  export let onClick: () => void;
</script>

{#if pendingCount > 0}
  <div class="fixed bottom-20 left-0 right-0 z-30 px-4 lg:hidden">
    <button
      on:click={onClick}
      class="w-full py-3 rounded-xl text-white font-semibold text-sm"
      style="background: var(--sys-navy)"
    >
      Próximo pendiente → ({pendingCount} restantes)
    </button>
  </div>
{/if}
