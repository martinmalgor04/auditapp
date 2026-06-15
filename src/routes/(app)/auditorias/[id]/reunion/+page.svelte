<script lang="ts">
  import type { PageData } from './$types';
  import ConsentBanner from '$lib/components/reunion/consent-banner.svelte';
  import AudioRecorder from '$lib/components/reunion/audio-recorder.svelte';
  import PipelineStatus from '$lib/components/reunion/pipeline-status.svelte';
  import ProposalReview from '$lib/components/reunion/proposal-review.svelte';
  import type { ReunionProposalWithItem } from '$lib/server/db/reunion-proposals';

  let { data }: { data: PageData } = $props();

  type Step = 'list' | 'consent' | 'audio' | 'pipeline' | 'review' | 'done';

  let step = $state<Step>(data.sessions.length > 0 ? 'list' : 'consent');
  let toast = $state('');
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  function showToast(msg: string) {
    toast = msg;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast = ''; }, 4000);
  }

  // Sesión activa
  let sessionId = $state<string | null>(null);

  // Pipeline polling
  type PipelineStatus_ = 'uploading' | 'processing' | 'ready_for_review' | 'error' | 'reviewed';
  let pipelineStatus = $state<PipelineStatus_>('uploading');
  let pipelineError = $state('');
  let pollingInterval: ReturnType<typeof setInterval> | null = null;

  // Propuestas
  let proposals = $state<ReunionProposalWithItem[]>([]);

  // Upload progress
  let uploadPhase = $state<'idle' | 'presigning' | 'uploading' | 'confirming' | 'done'>('idle');

  function startPolling(sid: string) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audits/${data.audit.id}/reunion/sessions/${sid}/status`);
        if (!res.ok) return;
        const json = await res.json() as { data: { status: PipelineStatus_; error_message?: string } };
        pipelineStatus = json.data.status;
        if (json.data.error_message) pipelineError = json.data.error_message;

        if (pipelineStatus === 'ready_for_review') {
          clearInterval(pollingInterval!);
          pollingInterval = null;
          await loadProposals(sid);
          step = 'review';
        } else if (pipelineStatus === 'error') {
          clearInterval(pollingInterval!);
          pollingInterval = null;
        }
      } catch {
        // ignorar errores de red
      }
    }, 3000);
  }

  async function loadProposals(sid: string) {
    const res = await fetch(`/api/audits/${data.audit.id}/reunion/sessions/${sid}`);
    if (!res.ok) return;
    const json = await res.json() as { data: { proposals?: ReunionProposalWithItem[] } };
    proposals = json.data.proposals ?? [];
  }

  // Consentimiento
  async function handleConsent(opts: { sessionType: 'kickoff' | 'visita' | 'otro'; consentNote: string }) {
    const res = await fetch(`/api/audits/${data.audit.id}/reunion/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_type: opts.sessionType,
        consent_recorded_at: new Date().toISOString(),
        consent_note: opts.consentNote || null
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      showToast(err.error?.message ?? 'Error al crear sesión');
      return;
    }

    const json = await res.json() as { data: { session_id: string } };
    sessionId = json.data.session_id;
    step = 'audio';
  }

  // Audio blob listo → upload
  async function handleBlob(blob: Blob, filename: string, contentType: 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/x-m4a') {
    if (!sessionId) return;
    step = 'pipeline';
    pipelineStatus = 'uploading';
    uploadPhase = 'presigning';

    try {
      const { uploadReunionAudio } = await import('$lib/client/reunion/upload');
      await uploadReunionAudio({
        auditId: data.audit.id,
        sessionId,
        blob,
        filename,
        contentType,
        onProgress: (p) => {
          uploadPhase = p.phase as typeof uploadPhase;
        }
      });

      pipelineStatus = 'processing';
      startPolling(sessionId);
    } catch (err) {
      pipelineStatus = 'error';
      pipelineError = err instanceof Error ? err.message : 'Error al subir audio';
    }
  }

  // Acciones de propuesta
  async function handleAccept(proposalId: string) {
    const res = await fetch(`/api/audits/${data.audit.id}/reunion/proposals/${proposalId}/accept`, {
      method: 'POST'
    });
    if (res.ok && sessionId) {
      await loadProposals(sessionId);
    }
  }

  async function handleReject(proposalId: string) {
    const res = await fetch(`/api/audits/${data.audit.id}/reunion/proposals/${proposalId}/reject`, {
      method: 'POST'
    });
    if (res.ok && sessionId) {
      await loadProposals(sessionId);
    }
  }

  async function handleEdit(proposalId: string, value: unknown) {
    const res = await fetch(`/api/audits/${data.audit.id}/reunion/proposals/${proposalId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_value: value })
    });
    if (res.ok && sessionId) {
      await loadProposals(sessionId);
    }
  }

  async function handleFinalize() {
    if (!sessionId) return;
    const res = await fetch(`/api/audits/${data.audit.id}/reunion/sessions/${sessionId}/finalize`, {
      method: 'POST'
    });
    if (res.ok) {
      const accepted = proposals.filter(p => p.review_status === 'accepted' || p.review_status === 'edited').length;
      step = 'done';
      showToast(`Revisión completada. ${accepted} ítem(s) actualizado(s) en el formulario.`);
    }
  }

  function resetToList() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    sessionId = null;
    step = data.sessions.length > 0 ? 'list' : 'consent';
    proposals = [];
    pipelineStatus = 'uploading';
    pipelineError = '';
    uploadPhase = 'idle';
  }

  const SESSION_TYPE_LABELS: Record<string, string> = {
    kickoff: 'Kickoff',
    visita: 'Visita técnica',
    otro: 'Otro'
  };

  const SESSION_STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador',
    uploading: 'Subiendo',
    processing: 'Procesando',
    ready_for_review: 'Para revisar',
    reviewed: 'Revisada',
    error: 'Error'
  };
</script>

<svelte:head>
  <title>Asistente de reunión — {data.audit.razonSocial}</title>
</svelte:head>

{#if toast}
  <div class="fixed bottom-4 right-4 z-50 rounded-sys-app bg-sys-oscuro px-4 py-3 text-sm text-white shadow-lg" role="status">
    {toast}
  </div>
{/if}

<div class="max-w-2xl space-y-6">
  <div class="flex items-center gap-2">
    <a href="/auditorias/{data.audit.id}" class="text-sm text-sys-medio hover:text-sys-electrico">
      ← {data.audit.razonSocial}
    </a>
  </div>

  <div class="space-y-1">
    <h1 class="sys-page-title">Asistente de reunión</h1>
    <p class="sys-muted">Grabar o subir audio de la sesión para extraer datos automáticamente</p>
  </div>

  {#if step === 'list'}
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="sys-section-title">Sesiones anteriores</h2>
        <button
          type="button"
          onclick={() => { step = 'consent'; }}
          class="sys-btn-primary text-sm"
        >
          Nueva sesión
        </button>
      </div>

      {#each data.sessions as session (session.id)}
        <a
          href="/auditorias/{data.audit.id}/reunion/{session.id}"
          class="block rounded-sys-app border border-sys-borde bg-white p-4 hover:border-sys-electrico transition-colors"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="space-y-0.5">
              <p class="text-sm font-medium text-sys-oscuro">
                {SESSION_TYPE_LABELS[session.session_type] ?? session.session_type}
              </p>
              <p class="text-xs text-sys-medio">
                {new Date(session.created_at).toLocaleDateString('es-AR')} · {session.started_by_name}
              </p>
            </div>
            <span class="rounded px-2 py-0.5 text-xs font-medium border {session.status === 'reviewed' ? 'border-sys-verde/30 bg-sys-verde/10 text-sys-verde' : session.status === 'error' ? 'border-sys-rojo/30 bg-sys-rojo/10 text-sys-rojo' : session.status === 'ready_for_review' ? 'border-sys-naranja/30 bg-sys-naranja/10 text-sys-naranja' : 'border-sys-borde text-sys-medio'}">
              {SESSION_STATUS_LABELS[session.status] ?? session.status}
            </span>
          </div>
        </a>
      {/each}
    </section>

  {:else if step === 'consent'}
    <ConsentBanner
      accepted={false}
      sessionType="visita"
      onConfirm={handleConsent}
    />
    {#if data.sessions.length > 0}
      <button type="button" onclick={resetToList} class="text-sm text-sys-medio hover:text-sys-electrico">
        ← Volver a sesiones
      </button>
    {/if}

  {:else if step === 'audio'}
    <AudioRecorder onBlob={handleBlob} />
    <button type="button" onclick={resetToList} class="text-sm text-sys-medio hover:text-sys-electrico">
      ← Cancelar
    </button>

  {:else if step === 'pipeline'}
    <PipelineStatus status={pipelineStatus} errorMessage={pipelineError} />
    {#if pipelineStatus === 'error'}
      <button type="button" onclick={resetToList} class="sys-btn-secondary">Volver al inicio</button>
    {/if}

  {:else if step === 'review'}
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="sys-section-title">Sugerencias detectadas</h2>
        <span class="text-sm text-sys-medio">{proposals.length} ítem(s)</span>
      </div>

      <ProposalReview
        {proposals}
        onAccept={handleAccept}
        onReject={handleReject}
        onEdit={handleEdit}
      />

      <button type="button" onclick={handleFinalize} class="sys-btn-primary w-full">
        Finalizar revisión
      </button>
    </div>

  {:else if step === 'done'}
    <div class="rounded-sys-app border border-sys-verde/30 bg-sys-verde/5 p-5 text-center space-y-3">
      <p class="text-2xl">✓</p>
      <p class="text-sm font-medium text-sys-oscuro">Revisión completada</p>
      <p class="text-sm text-sys-medio">Los datos aceptados ya están en el formulario de auditoría.</p>
      <div class="flex gap-3 justify-center mt-4">
        <a href="/auditorias/{data.audit.id}/form" class="sys-btn-primary text-sm">
          Ir al formulario
        </a>
        <button type="button" onclick={resetToList} class="sys-btn-secondary text-sm">
          Nueva sesión
        </button>
      </div>
    </div>
  {/if}
</div>
