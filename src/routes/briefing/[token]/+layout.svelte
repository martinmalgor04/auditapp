<script lang="ts">
  let { children } = $props();
</script>

<div class="min-h-screen bg-sys-offwhite text-[var(--sys-text-body-light)]"
  style="padding-top: env(safe-area-inset-top, 0px); padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);">
  <div class="mx-auto max-w-lg px-4 py-6">
    {@render children?.()}
  </div>
</div>
