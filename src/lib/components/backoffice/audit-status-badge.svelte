<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';
  import { getStatusBadgeClasses } from '$lib/backoffice/status-colors';

  let { status, label }: { status: AuditStatus; label?: string } = $props();

  const STATUS_LABELS: Record<AuditStatus, string> = {
    borrador: 'Borrador',
    briefing_enviado: 'Briefing enviado',
    briefing_completo: 'Briefing completo',
    en_relevamiento: 'En relevamiento',
    en_cierre: 'En cierre',
    cerrada: 'Cerrada'
  };
</script>

<span
  data-status={status}
  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusBadgeClasses(status)}"
>
  {label ?? STATUS_LABELS[status]}
</span>
