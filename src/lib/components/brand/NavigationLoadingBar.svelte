<script lang="ts">
  import { navigating } from '$app/stores';
</script>

{#if $navigating}
  <div class="fixed top-0 left-0 right-0 h-1 bg-sys-electrico animate-pulse z-50" />
{/if}
