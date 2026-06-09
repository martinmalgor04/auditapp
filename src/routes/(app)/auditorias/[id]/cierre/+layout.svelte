<script lang="ts">
  let { children }: { children: import('svelte').Snippet } = $props();
</script>

<!-- Hereda SysShell light de (app)/+layout.svelte — R11 -->
<div class="space-y-6">
  {@render children?.()}
</div>
