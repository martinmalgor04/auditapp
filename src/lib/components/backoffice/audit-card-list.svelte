<script lang="ts">
  import type { DashboardAuditRow } from '$lib/backoffice/dashboard-types';
  import AuditStatusBadge from './audit-status-badge.svelte';
  import AuditProgressBar from './audit-progress-bar.svelte';
  import CopyLinkButton from './copy-link-button.svelte';
  import AuditRowActions from './audit-row-actions.svelte';
  import { formatDate } from '$lib/utils/format';

  let { rows }: { rows: DashboardAuditRow[] } = $props();
</script>

<div class="space-y-4 md:hidden" data-testid="audit-card-list-mobile">
  {#each rows as row}
    <article class="sys-card-pad space-y-3">
      <div class="flex items-start justify-between gap-3">
        <a href="/auditorias/{row.id}" class="min-w-0 font-medium text-sys-profundo hover:text-sys-electrico">
          {row.razonSocial}
        </a>
        <AuditStatusBadge status={row.status} />
      </div>
      <p class="sys-muted">{row.types.join(', ')} · Seg. {row.segment}</p>
      <AuditProgressBar progress={row.progress} />
      <dl class="grid grid-cols-2 gap-2 text-xs text-[var(--sys-text-muted-light)]">
        <div><dt class="inline">Técnico: </dt><dd class="inline">{row.techName}</dd></div>
        <div><dt class="inline">Visita: </dt><dd class="inline">{formatDate(row.scheduledAt)}</dd></div>
        <div class="col-span-2">
          <dt class="inline">Actualización: </dt><dd class="inline">{formatDate(row.lastActivity)}</dd>
        </div>
      </dl>
      <AuditRowActions auditId={row.id} status={row.status} />
      {#if row.briefingUrl}
        <CopyLinkButton url={row.briefingUrl} />
      {/if}
    </article>
  {:else}
    <p class="py-12 text-center text-[var(--sys-text-muted-light)]">No hay auditorías</p>
  {/each}
</div>
