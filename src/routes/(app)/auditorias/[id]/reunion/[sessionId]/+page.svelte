<script lang="ts">
  import { page } from '$app/stores';
  import ProposalReview from '$lib/components/reunion/proposal-review.svelte';
  import type { ReunionProposalWithItem } from '$lib/server/db/reunion-proposals';
  import type { ReunionSessionWithUser } from '$lib/server/db/reunion-sessions';

  const auditId = $derived($page.params.id);
  const sessionId = $derived($page.params.sessionId);

  let session = $state<ReunionSessionWithUser | null>(null);
  let proposals = $state<ReunionProposalWithItem[]>([]);
  let transcript = $state<string | null>(null);
  let loading = $state(true);
  let error = $state('');
  let toast = $state('');

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => { toast = ''; }, 4000);
  }

  async function loadData() {
    loading = true;
    error = '';
    try {
      const res = await fetch(`/api/audits/${auditId}/reunion/sessions/${sessionId}`);
      if (!res.ok) {
        error = 'No se pudo cargar la sesión';
        return;
      }
      const json = await res.json() as { data: { session: ReunionSessionWithUser; proposals: ReunionProposalWithItem[]; transcript?: { full_text?: string } | null } };
      session = json.data.session;
      proposals = json.data.proposals ?? [];
      transcript = json.data.transcript?.full_text ?? null;
    } catch {
      error = 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  async function handleAccept(proposalId: string) {
    const res = await fetch(`/api/audits/${auditId}/reunion/proposals/${proposalId}/accept`, { method: 'POST' });
    if (res.ok) { await loadData(); showToast('Propuesta aceptada'); }
  }

  async function handleReject(proposalId: string) {
    const res = await fetch(`/api/audits/${auditId}/reunion/proposals/${proposalId}/reject`, { method: 'POST' });
    if (res.ok) { await loadData(); showToast('Propuesta rechazada'); }
  }

  async function handleEdit(proposalId: string, value: unknown) {
    const res = await fetch(`/api/audits/${auditId}/reunion/proposals/${proposalId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_value: value })
    });
    if (res.ok) { await loadData(); showToast('Valor editado y aceptado'); }
  }

  const SESSION_TYPE_LABELS: Record<string, string> = {
    kickoff: 'Kickoff',
    visita: 'Visita técnica',
    otro: 'Otro'
  };

  // Cargar al montar
  $effect(() => {
    loadData();
  });
</script>

<svelte:head>
  <title>Detalle de sesión — Asistente de reunión</title>
</svelte:head>

{#if toast}
  <div class="fixed bottom-4 right-4 z-50 rounded-sys-app bg-sys-oscuro px-4 py-3 text-sm text-white shadow-lg" role="status">
    {toast}
  </div>
{/if}

<div class="max-w-2xl space-y-6">
  <div class="flex items-center gap-2">
    <a href="/auditorias/{auditId}/reunion" class="text-sm text-sys-medio hover:text-sys-electrico">
      ← Asistente de reunión
    </a>
  </div>

  {#if loading}
    <div class="flex items-center gap-2 py-8">
      <span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sys-electrico border-t-transparent"></span>
      <span class="text-sm text-sys-medio">Cargando...</span>
    </div>
  {:else if error}
    <p class="text-sm text-sys-rojo" role="alert">{error}</p>
  {:else if session}
    <div class="space-y-1">
      <h1 class="sys-page-title">
        {SESSION_TYPE_LABELS[session.session_type] ?? session.session_type}
      </h1>
      <p class="sys-muted">
        {new Date(session.created_at).toLocaleString('es-AR')} · {session.started_by_name}
      </p>
    </div>

    {#if transcript}
      <section class="sys-card-pad space-y-2">
        <h2 class="sys-section-title">Transcripción</h2>
        <p class="text-sm text-sys-medio whitespace-pre-wrap leading-relaxed">{transcript}</p>
      </section>
    {/if}

    {#if proposals.length > 0}
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="sys-section-title">Propuestas</h2>
          <span class="text-sm text-sys-medio">{proposals.length} ítem(s)</span>
        </div>
        <ProposalReview
          {proposals}
          onAccept={handleAccept}
          onReject={handleReject}
          onEdit={handleEdit}
        />
      </section>
    {:else}
      <p class="text-sm text-sys-medio">Esta sesión no tiene propuestas aún.</p>
    {/if}
  {/if}
</div>
