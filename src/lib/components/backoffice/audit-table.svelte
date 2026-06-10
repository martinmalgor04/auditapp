<script lang="ts">
  import type { DashboardAuditRow } from '$lib/backoffice/dashboard-types';
  import AuditStatusBadge from './audit-status-badge.svelte';
  import AuditProgressBar from './audit-progress-bar.svelte';
  import CopyLinkButton from './copy-link-button.svelte';
  import AuditRowActions from './audit-row-actions.svelte';

  let { rows }: { rows: DashboardAuditRow[] } = $props();

  function formatDate(d: Date | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-AR');
  }
</script>

<div class="hidden md:block overflow-x-auto" data-testid="audit-table-desktop">
  <table class="min-w-full divide-y divide-slate-200 text-sm">
    <thead class="bg-slate-50">
      <tr>
        <th class="px-4 py-3 text-left font-medium text-slate-600">Cliente</th>
        <th class="px-4 py-3 text-left font-medium text-slate-600">Tipos</th>
        <th class="px-4 py-3 text-left font-medium text-slate-600">Estado</th>
        <th class="px-4 py-3 text-left font-medium text-slate-600">Avance</th>
        <th class="px-4 py-3 text-left font-medium text-slate-600">Técnico</th>
        <th class="px-4 py-3 text-left font-medium text-slate-600">Visita</th>
        <th class="px-4 py-3 text-left font-medium text-slate-600">Actualización</th>
        <th class="px-4 py-3 text-left font-medium text-slate-600">Acciones</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-100 bg-white">
      {#each rows as row}
        <tr>
          <td class="px-4 py-3">
            <a href="/auditorias/{row.id}" class="font-medium text-slate-900 hover:underline">
              {row.razonSocial}
            </a>
            <span class="text-xs text-slate-500 block">Seg. {row.segment}</span>
          </td>
          <td class="px-4 py-3 text-slate-700">{row.types.join(', ')}</td>
          <td class="px-4 py-3"><AuditStatusBadge status={row.status} /></td>
          <td class="px-4 py-3"><AuditProgressBar progress={row.progress} /></td>
          <td class="px-4 py-3 text-slate-700">{row.techName}</td>
          <td class="px-4 py-3 text-slate-600">{formatDate(row.scheduledAt)}</td>
          <td class="px-4 py-3 text-slate-600">{formatDate(row.lastActivity)}</td>
          <td class="px-4 py-3">
            <div class="flex flex-col gap-2">
              <AuditRowActions auditId={row.id} status={row.status} />
              {#if row.briefingUrl}
                <CopyLinkButton url={row.briefingUrl} />
              {/if}
            </div>
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="8" class="px-4 py-8 text-center text-slate-500">No hay auditorías</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
