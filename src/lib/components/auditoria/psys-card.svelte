<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { canShowCreateProposal, canShowSyncProposal, translatePsysStatus } from '$lib/psys/view';

  type ProposalLinkView = {
    link_id: string;
    proposal_id: string | null;
    number_display: string | null;
    proposal_url: string | null;
    psys_status: string | null;
    report_version: number | null;
    synced_at: string | null;
  };

  let {
    auditId,
    isAdmin,
    hasApprovedReport,
    proposalLink
  }: {
    auditId: string;
    isAdmin: boolean;
    hasApprovedReport: boolean;
    proposalLink: ProposalLinkView | null;
  } = $props();

  let link = $state(proposalLink);
  let busy = $state(false);
  let panelError = $state('');
  let syncError = $state(false);

  const showCreate = $derived(
    canShowCreateProposal({
      isAdmin,
      hasApprovedReport,
      hasActiveLink: link !== null
    })
  );
  const showSync = $derived(canShowSyncProposal({ isAdmin, hasActiveLink: link !== null }));

  async function call(method: 'POST' | 'GET'): Promise<void> {
    busy = true;
    panelError = '';
    syncError = false;
    try {
      const res = await fetch(`/api/audits/${auditId}/proposal`, { method });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        data?: ProposalLinkView & { sync_error?: boolean };
      } | null;
      if (!res.ok) {
        panelError = body?.error ?? 'La acción falló';
        return;
      }
      if (body?.data) {
        link = body.data;
        syncError = body.data.sync_error === true;
      }
      await invalidateAll();
    } finally {
      busy = false;
    }
  }
</script>

<section class="sys-card-pad space-y-4" data-testid="psys-card">
  <h2 class="sys-section-title">Presupuesto comercial</h2>

  {#if panelError}
    <p class="text-sm text-sys-rojo" role="alert">{panelError}</p>
  {/if}

  {#if syncError}
    <p class="text-sm text-sys-naranja" role="status">
      No se pudo actualizar el estado remoto. Se muestra el último valor conocido.
    </p>
  {/if}

  {#if link?.proposal_url}
    <div class="space-y-2">
      {#if link.number_display}
        <p class="text-sm">
          <span class="sys-muted">Número:</span>
          <span class="font-medium">{link.number_display}</span>
        </p>
      {/if}
      <p class="text-sm">
        <span class="sys-muted">Estado:</span>
        <span class="font-medium">{translatePsysStatus(link.psys_status)}</span>
      </p>
      <a
        href={link.proposal_url}
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm font-medium text-sys-electrico hover:underline"
      >
        Abrir en presupuestossys
      </a>
    </div>
  {:else if showCreate}
    <p class="sys-muted text-sm">
      Creá el presupuesto comercial en presupuestossys a partir del informe aprobado.
    </p>
    <button type="button" class="sys-btn-primary" disabled={busy} onclick={() => call('POST')}>
      {busy ? 'Creando…' : 'Crear presupuesto'}
    </button>
  {:else if !hasApprovedReport && isAdmin}
    <p class="sys-muted text-sm">Aprobá un informe IA para habilitar la creación del presupuesto.</p>
  {/if}

  {#if showSync}
    <button type="button" class="sys-btn-secondary" disabled={busy} onclick={() => call('GET')}>
      {busy ? 'Actualizando…' : 'Actualizar estado'}
    </button>
  {/if}
</section>
