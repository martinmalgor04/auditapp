<script lang="ts">
  import type { DashboardAuditRow } from '$lib/backoffice/dashboard-types';
  import AuditStatusBadge from './audit-status-badge.svelte';
  import AuditProgressBar from './audit-progress-bar.svelte';
  import CopyLinkButton from './copy-link-button.svelte';
  import AuditRowActions from './audit-row-actions.svelte';
  import { formatDate } from '$lib/utils/format';

  let { rows }: { rows: DashboardAuditRow[] } = $props();
</script>

<div class="sys-card hidden overflow-hidden md:block" data-testid="audit-table-desktop">
  <table class="min-w-full text-sm">
    <thead class="bg-sys-offwhite/80">
      <tr>
        <th class="px-5 py-3.5 text-left font-medium text-[var(--sys-text-muted-light)]">Cliente</th>
        <th class="px-5 py-3.5 text-left font-medium text-[var(--sys-text-muted-light)]">Tipos</th>
        <th class="px-5 py-3.5 text-left font-medium text-[var(--sys-text-muted-light)]">Estado</th>
        <th class="px-5 py-3.5 text-left font-medium text-[var(--sys-text-muted-light)]">Avance</th>
        <th class="px-5 py-3.5 text-left font-medium text-[var(--sys-text-muted-light)]">Técnico</th>
        <th class="px-5 py-3.5 text-left font-medium text-[var(--sys-text-muted-light)]">Visita</th>
        <th class="px-5 py-3.5 text-left font-medium text-[var(--sys-text-muted-light)]">Actualización</th>
        <th class="px-5 py-3.5 text-left font-medium text-[var(--sys-text-muted-light)]">Acciones</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-[var(--sys-border-subtle)] bg-sys-blanco">
      {#each rows as row}
        <tr class="transition-colors hover:bg-sys-offwhite/40">
          <td class="px-5 py-4">
            <a href="/auditorias/{row.id}" class="font-medium text-sys-profundo hover:text-sys-electrico">
              {row.razonSocial}
            </a>
            <span class="block text-xs text-[var(--sys-text-muted-light)]">Seg. {row.segment}</span>
          </td>
          <td class="px-5 py-4 text-sys-medio">{row.types.join(', ')}</td>
          <td class="px-5 py-4"><AuditStatusBadge status={row.status} /></td>
          <td class="px-5 py-4"><AuditProgressBar progress={row.progress} /></td>
          <td class="px-5 py-4 text-sys-medio">{row.techName}</td>
          <td class="px-5 py-4 text-[var(--sys-text-muted-light)]">{formatDate(row.scheduledAt)}</td>
          <td class="px-5 py-4 text-[var(--sys-text-muted-light)]">{formatDate(row.lastActivity)}</td>
          <td class="px-5 py-4">
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
          <td colspan="8" class="px-5 py-12 text-center text-[var(--sys-text-muted-light)]">
            No hay auditorías
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
