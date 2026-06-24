<script lang="ts">
  import { navigating } from '$app/stores';
</script>

{#if $navigating}
  <div class="fixed top-0 left-0 right-0 z-50 h-[6px] bg-[--sys-primary] animate-pulse" />
{/if}
