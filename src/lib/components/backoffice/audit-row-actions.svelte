<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';
  import { canOpenClosure, canOpenForm } from '$lib/audit-status';

  let { auditId, status }: { auditId: string; status: AuditStatus } = $props();
</script>

<div class="flex flex-wrap items-center gap-2">
  <a href="/auditorias/{auditId}" class="sys-btn-secondary sys-btn-sm">Ver</a>
  {#if canOpenForm(status)}
    <a href="/auditorias/{auditId}/form" class="sys-btn-accent sys-btn-sm">Relevamiento</a>
  {/if}
  {#if canOpenClosure(status)}
    <a href="/auditorias/{auditId}/cierre" class="sys-btn-secondary sys-btn-sm">Cierre</a>
  {/if}
</div>
