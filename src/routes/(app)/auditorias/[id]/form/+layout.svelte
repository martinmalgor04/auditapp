<script lang="ts">
  let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="min-h-screen bg-[var(--sys-surface)] text-[var(--sys-text)] pb-24 -mx-4 -my-6 px-4 py-4 lg:mx-0 lg:my-0">
  {@render children?.()}
</div>
