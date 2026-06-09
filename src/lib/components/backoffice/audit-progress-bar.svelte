<script lang="ts">
  import type { AuditProgress } from '$lib/backoffice/progress-types';

  let { progress }: { progress: AuditProgress } = $props();
</script>

<div class="flex items-center gap-2 min-w-[6rem]" data-testid="audit-progress">
  <div class="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
    <div
      class="h-full rounded-full bg-emerald-500 transition-all"
      style="width: {progress.percent}%"
    ></div>
  </div>
  <span class="text-xs text-slate-600 tabular-nums w-8 text-right">{progress.percent}%</span>
</div>
