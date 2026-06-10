<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';
  import { canOpenClosure, canOpenForm } from '$lib/audit-status';

  let { auditId, status }: { auditId: string; status: AuditStatus } = $props();

  const linkClass =
    'inline-flex min-h-[var(--sys-touch-min)] items-center rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50';
  const primaryClass =
    'inline-flex min-h-[var(--sys-touch-min)] items-center rounded-sys bg-sys-electrico px-2.5 py-1 text-xs font-medium text-white hover:opacity-90';
</script>

<div class="flex flex-wrap items-center gap-2">
  <a href="/auditorias/{auditId}" class={linkClass}>Ver</a>
  {#if canOpenForm(status)}
    <a href="/auditorias/{auditId}/form" class={primaryClass}>Relevamiento</a>
  {/if}
  {#if canOpenClosure(status)}
    <a href="/auditorias/{auditId}/cierre" class={linkClass}>Cierre</a>
  {/if}
</div>
