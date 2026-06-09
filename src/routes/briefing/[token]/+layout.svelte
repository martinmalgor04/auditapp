<script lang="ts">
  import '$lib/styles/brand.css';

  let { children } = $props();
</script>

<div class="min-h-screen bg-[var(--sys-surface)] text-[var(--sys-text)]">
  <div class="mx-auto max-w-lg px-4 py-6">
    {@render children?.()}
  </div>
</div>
