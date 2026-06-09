<script lang="ts">
  let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="min-h-screen bg-sys-offwhite text-[var(--sys-text-body-light)] pb-24">
  {@render children?.()}
</div>
