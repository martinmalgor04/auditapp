<script lang="ts">
  import { navigating } from '$app/stores';
</script>

{#if $navigating}
  <div
    class="fixed left-0 right-0 top-0 z-50 h-1 bg-sys-electrico animate-pulse"
    aria-label="Cargando"
  ></div>
{/if}
