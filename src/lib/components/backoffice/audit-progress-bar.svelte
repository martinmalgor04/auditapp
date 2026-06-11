<script lang="ts">
  import type { AuditProgress } from '$lib/backoffice/progress-types';

  let { progress }: { progress: AuditProgress } = $props();
</script>

<div class="flex min-w-[6rem] items-center gap-2.5" data-testid="audit-progress">
  <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-sys-offwhite">
    <div
      class="h-full rounded-full bg-sys-verde transition-all duration-500 ease-out"
      style="width: {progress.percent}%"
    ></div>
  </div>
  <span class="w-8 text-right text-xs tabular-nums text-[var(--sys-text-muted-light)]">{progress.percent}%</span>
</div>
