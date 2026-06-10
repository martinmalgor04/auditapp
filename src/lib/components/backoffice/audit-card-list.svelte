<script lang="ts">
  import type { DashboardAuditRow } from '$lib/backoffice/dashboard-types';
  import AuditStatusBadge from './audit-status-badge.svelte';
  import AuditProgressBar from './audit-progress-bar.svelte';
  import CopyLinkButton from './copy-link-button.svelte';

  let { rows }: { rows: DashboardAuditRow[] } = $props();

  function formatDate(d: Date | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-AR');
  }
</script>

<div class="md:hidden space-y-3" data-testid="audit-card-list-mobile">
  {#each rows as row}
    <article class="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
      <div class="flex items-start justify-between gap-2">
        <a href="/auditorias/{row.id}" class="min-w-0 font-medium text-slate-900 hover:underline">
          {row.razonSocial}
        </a>
        <AuditStatusBadge status={row.status} />
      </div>
      <p class="text-sm text-slate-600">{row.types.join(', ')} · Seg. {row.segment}</p>
      <AuditProgressBar progress={row.progress} />
      <dl class="grid grid-cols-2 gap-1 text-xs text-slate-600">
        <div><dt class="inline">Técnico: </dt><dd class="inline">{row.techName}</dd></div>
        <div><dt class="inline">Visita: </dt><dd class="inline">{formatDate(row.scheduledAt)}</dd></div>
        <div class="col-span-2">
          <dt class="inline">Actualización: </dt><dd class="inline">{formatDate(row.lastActivity)}</dd>
        </div>
      </dl>
      {#if row.briefingUrl}
        <CopyLinkButton url={row.briefingUrl} />
      {/if}
    </article>
  {:else}
    <p class="text-center text-slate-500 py-8">No hay auditorías</p>
  {/each}
</div>
