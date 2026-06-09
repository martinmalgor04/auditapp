<script lang="ts">
  let { children } = $props();
</script>

<div class="min-h-screen bg-sys-offwhite text-[var(--sys-text-body-light)]">
  <div class="mx-auto max-w-lg px-4 py-6">
    {@render children?.()}
  </div>
</div>
