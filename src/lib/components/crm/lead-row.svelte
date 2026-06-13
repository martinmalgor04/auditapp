<script lang="ts">
  import SysBadge from '$lib/components/brand/SysBadge.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import { CRM_STATUS_LABELS, CRM_SOURCE_LABELS } from '$lib/crm/view';
  import { nextStatuses } from '$lib/crm/transitions';
  import type { CrmLeadEventRow, CrmLeadRow } from '$lib/server/db/crm-leads';

  let {
    lead,
    events,
    isAdmin,
    onStatusChanged
  }: {
    lead: CrmLeadRow;
    events: CrmLeadEventRow[];
    isAdmin: boolean;
    onStatusChanged: () => void;
  } = $props();

  let expanded = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const transitions = $derived(nextStatuses(lead.status));

  async function changeStatus(to: string) {
    saving = true;
    error = null;
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to })
      });
      const body = await res.json();
      if (!res.ok) {
        error = body.error ?? 'Error al cambiar estado';
        return;
      }
      onStatusChanged();
    } catch {
      error = 'Error de red';
    } finally {
      saving = false;
    }
  }
</script>

<tr class="border-b border-sys-borde hover:bg-sys-offwhite/50" data-testid="crm-lead-row">
  <td class="px-4 py-3">
    <SysBadge status="borrador" label={CRM_STATUS_LABELS[lead.status]} />
  </td>
  <td class="px-4 py-3 font-medium text-sys-profundo">{lead.empresa}</td>
  <td class="px-4 py-3 text-sys-medio">{lead.contacto ?? '—'}</td>
  <td class="px-4 py-3 text-sys-medio">{lead.email}</td>
  <td class="px-4 py-3 text-sys-medio">{CRM_SOURCE_LABELS[lead.source] ?? lead.source}</td>
  <td class="px-4 py-3 text-sys-medio">{lead.proximaAccion ?? '—'}</td>
  <td class="px-4 py-3 text-sys-medio">{lead.proximaAccionFecha ?? '—'}</td>
  <td class="px-4 py-3">
    <button
      type="button"
      class="text-sm text-sys-electrico hover:underline"
      onclick={() => (expanded = !expanded)}
      data-testid="crm-lead-expand"
    >
      {expanded ? 'Ocultar' : 'Detalle'}
    </button>
  </td>
</tr>
{#if expanded}
  <tr class="bg-sys-offwhite/30">
    <td colspan="8" class="px-4 py-4">
      <div class="space-y-4">
        {#if lead.notas}
          <div>
            <h3 class="text-sm font-medium text-sys-profundo">Notas</h3>
            <p class="mt-1 whitespace-pre-wrap text-sm text-sys-medio">{lead.notas}</p>
          </div>
        {/if}
        <div class="flex flex-wrap items-center gap-3">
          <label class="text-sm text-sys-medio">
            Avanzar estado
            <select
              class="ml-2 rounded-sys border border-sys-borde px-2 py-1"
              disabled={saving || transitions.length === 0}
              onchange={(e) => {
                const to = (e.currentTarget as HTMLSelectElement).value;
                if (to) changeStatus(to);
                (e.currentTarget as HTMLSelectElement).value = '';
              }}
              data-testid="crm-status-select"
            >
              <option value="">—</option>
              {#each transitions as t}
                <option value={t}>{CRM_STATUS_LABELS[t]}</option>
              {/each}
            </select>
          </label>
          {#if error}
            <span class="text-sm text-red-600">{error}</span>
          {/if}
        </div>
        {#if events.length > 0}
          <div>
            <h3 class="text-sm font-medium text-sys-profundo">Historial</h3>
            <ul class="mt-2 space-y-1 text-sm text-sys-medio">
              {#each events as ev}
                <li>
                  {CRM_STATUS_LABELS[ev.fromStatus as keyof typeof CRM_STATUS_LABELS] ?? ev.fromStatus}
                  →
                  {CRM_STATUS_LABELS[ev.toStatus as keyof typeof CRM_STATUS_LABELS] ?? ev.toStatus}
                  <span class="text-xs text-sys-medio/70">
                    ({new Date(ev.createdAt).toLocaleString('es-AR')})
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if isAdmin}
          <p class="text-xs text-sys-medio">Edición avanzada vía API PATCH (admin).</p>
        {/if}
      </div>
    </td>
  </tr>
{/if}
