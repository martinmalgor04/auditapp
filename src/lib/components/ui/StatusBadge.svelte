<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';

  export let status: AuditStatus;
  export let scoreLow: boolean = false;

  type StyleDef = { background: string; color: string };

  const STATUS_STYLES: Record<AuditStatus, StyleDef> = {
    cerrada: {
      background: 'rgba(16,185,129,.12)',
      color: 'var(--sys-status-green)'
    },
    en_cierre: {
      background: 'rgba(245,158,11,.12)',
      color: 'var(--sys-status-amber)'
    },
    borrador: {
      background: 'var(--sys-status-blue-bg)',
      color: 'var(--sys-status-blue-text)'
    },
    briefing_enviado: {
      background: 'var(--sys-status-blue-bg)',
      color: 'var(--sys-status-blue-text)'
    },
    briefing_completo: {
      background: 'var(--sys-status-blue-bg)',
      color: 'var(--sys-status-blue-text)'
    },
    en_relevamiento: {
      background: 'var(--sys-status-blue-bg)',
      color: 'var(--sys-status-blue-text)'
    }
  };

  const STATUS_LABELS: Record<AuditStatus, string> = {
    cerrada: 'Cerrada',
    en_cierre: 'En cierre',
    borrador: 'Borrador',
    briefing_enviado: 'Briefing enviado',
    briefing_completo: 'Briefing completo',
    en_relevamiento: 'En relevamiento'
  };

  $: styles = scoreLow
    ? { background: 'rgba(239,68,68,.12)', color: 'var(--sys-status-red)' }
    : (STATUS_STYLES[status] ?? STATUS_STYLES['borrador']);

  $: label = STATUS_LABELS[status] ?? status;
</script>

<span
  class="rounded-full px-2 py-0.5 text-xs font-semibold"
  style="background:{styles.background};color:{styles.color}"
>
  {label}
</span>
