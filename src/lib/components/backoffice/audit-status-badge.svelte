<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';
  import SysBadge from '$lib/components/brand/SysBadge.svelte';

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

<SysBadge {status} label={label ?? STATUS_LABELS[status]} />
