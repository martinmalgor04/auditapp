<script lang="ts">
  let { visible = false }: { visible?: boolean } = $props();
</script>

{#if visible}
  <span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
    Precargado del briefing
  </span>
{/if}
