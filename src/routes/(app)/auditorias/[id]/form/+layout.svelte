<script lang="ts">
  let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div
  class="min-h-screen bg-sys-offwhite text-[var(--sys-text-body-light)]"
  style="padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px));"
>
  {@render children?.()}
</div>
