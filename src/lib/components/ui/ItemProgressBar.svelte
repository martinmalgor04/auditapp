<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';
  export let value: number; // 0–100
  export let status: AuditStatus;

  $: fillColor =
    status === 'cerrada'
      ? 'var(--sys-status-green)'
      : status === 'en_cierre'
        ? 'var(--sys-status-amber)'
        : 'var(--sys-primary)';
</script>

<div
  class="h-[5px] rounded-full w-full"
  style="background: var(--sys-border);"
  data-testid="item-progress-bar"
>
  <div
    class="h-full rounded-full"
    style="width: {value}%; background: {fillColor};"
    data-testid="item-progress-bar-fill"
  ></div>
</div>
