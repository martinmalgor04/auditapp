<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import ReportStatusBadge from '$lib/components/informe/report-status-badge.svelte';
  import ReportRender from '$lib/components/informe/report-render.svelte';
  import InlineEditor from '$lib/components/informe/inline-editor.svelte';
  import SectionEditor from '$lib/components/informe/section-editor.svelte';
  import SharePanel from '$lib/components/informe/share-panel.svelte';
  import SurveyResult from '$lib/components/informe/survey-result.svelte';
  import InternalView from '$lib/components/informe/internal-view.svelte';
  import { startReportPolling } from '$lib/client/informe/polling';
  import type { RenderClientDraft } from '$lib/informe/render';
  import EnviarInformeDialog from '$lib/components/informe/enviar-informe-dialog.svelte';

  let { data }: { data: PageData } = $props();

  let tab = $state<'cliente' | 'interna'>('cliente');
  let status = $state(data.status);
  let editMode = $state(false);
  let busy = $state(false);
  let actionError = $state('');
  let loomInput = $state(data.loomUrl ?? '');
  let ejemplar = $state(data.ejemplar);
  let model = $state(data.model);

  // #51 — Envío por email
  let showEnviarDialog = $state(false);
  let toast = $state<{ type: 'success' | 'error'; message: string } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(type: 'success' | 'error', message: string) {
    toast = { type, message };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  function onEnviarSent(to: string) {
    showEnviarDialog = false;
    showToast('success', `Informe enviado a ${to}`);
    invalidateAll();
  }

  function onEnviarError(message: string) {
    showEnviarDialog = false;
    showToast('error', message);
  }

  const hasValidEmail = $derived(
    !!data.empresaEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.empresaEmail)
  );

  $effect(() => {
    status = data.status;
    model = data.model;
    ejemplar = data.ejemplar;
  });

  $effect(() => {
    if (status === 'pendiente' || status === 'generando') {
      const stop = startReportPolling(data.auditId, data.version, async (payload) => {
        status = payload.status as typeof status;
        if (payload.status === 'borrador' || payload.status === 'aprobado') {
          await invalidateAll();
        }
      });
      return stop;
    }
  });

  async function call(path: string, method = 'POST', body?: unknown): Promise<boolean> {
    busy = true;
    actionError = '';
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) {
        const parsed = (await res.json().catch(() => null)) as { error?: string } | null;
        actionError = parsed?.error ?? 'La acción falló';
        return false;
      }
      await invalidateAll();
      return true;
    } finally {
      busy = false;
    }
  }

  const base = $derived(`/api/audits/${data.auditId}/report`);

  function onInlineDone(draft: RenderClientDraft): void {
    editMode = false;
    if (model) model = { ...model, draft };
  }

  function onSectionSaved(draft: RenderClientDraft): void {
    if (model) model = { ...model, draft };
  }
</script>

<svelte:head>
  <title>Informe IA v{data.version} — auditapp</title>
</svelte:head>

<div class="max-w-5xl space-y-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <h1 class="sys-page-title">Informe IA · v{data.version}</h1>
      <ReportStatusBadge {status} />
    </div>
    <a href="/auditorias/{data.auditId}" class="text-sm text-sys-electrico hover:underline">
      ← Volver a la auditoría
    </a>
  </div>

  {#if actionError}
    <p class="text-sm text-sys-rojo" role="alert">{actionError}</p>
  {/if}

  {#if status === 'pendiente' || status === 'generando'}
    <p class="rounded-sys-app border border-sys-electrico/20 bg-sys-electrico/5 p-4 text-sm">
      Generando el borrador con IA… esta pantalla se actualiza sola.
    </p>
  {:else if status === 'error'}
    <div class="space-y-3 rounded-sys-app border border-sys-rojo/20 bg-sys-rojo/5 p-4">
      <p class="text-sm text-sys-rojo">{data.errorMessage ?? 'La generación falló.'}</p>
      <button
        type="button"
        class="sys-btn-primary"
        disabled={busy}
        onclick={() => call(`${base}/${data.version}/retry`)}
      >
        Reintentar
      </button>
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-3">
      {#if status === 'borrador'}
        <button
          type="button"
          class="sys-btn-primary"
          disabled={busy}
          onclick={() =>
            confirm('¿Aprobar este informe? Después no se puede editar.') &&
            call(`${base}/${data.version}/approve`)}
        >
          Aprobar
        </button>
        <button
          type="button"
          class="sys-btn-secondary"
          onclick={() => (editMode = !editMode)}
          disabled={busy}
        >
          {editMode ? 'Salir de edición' : 'Editar sobre el informe'}
        </button>
      {/if}
      <button
        type="button"
        class="sys-btn-secondary"
        disabled={busy}
        onclick={() => confirm('¿Regenerar? Crea una nueva versión.') && call(base)}
      >
        Regenerar (nueva versión)
      </button>
      <a href="/auditorias/{data.auditId}/informe/{data.version}/imprimir" class="sys-btn-accent">
        Vista de impresión
      </a>
      {#if model}
        <a
          href="{base}/{data.version}/html"
          class="sys-btn-secondary"
          data-testid="descargar-html"
        >
          Descargar HTML
        </a>
      {/if}
    </div>

    <div class="flex gap-1 border-b border-sys-offwhite">
      <button
        type="button"
        class="px-4 py-2 text-sm font-semibold {tab === 'cliente'
          ? 'border-b-2 border-sys-electrico text-sys-electrico'
          : 'text-sys-medio'}"
        onclick={() => (tab = 'cliente')}
      >
        Informe cliente
      </button>
      <button
        type="button"
        class="px-4 py-2 text-sm font-semibold {tab === 'interna'
          ? 'border-b-2 border-sys-electrico text-sys-electrico'
          : 'text-sys-medio'}"
        onclick={() => (tab = 'interna')}
        data-testid="tab-vista-interna"
      >
        Vista interna
      </button>
    </div>

    {#if status === 'aprobado'}
      <SharePanel auditId={data.auditId} version={data.version} shares={data.shares} />
      {#if data.isAdmin}
        <SurveyResult encuesta={data.encuesta} />
      {/if}
      {#if data.isAdmin}
        <!-- #51 — Envío del informe por email (R1, R6, R7) -->
        <div class="sys-card-pad space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="sys-btn-primary"
              disabled={!hasValidEmail}
              title={hasValidEmail ? 'Enviar informe al cliente por email' : 'La empresa no tiene email registrado'}
              onclick={() => (showEnviarDialog = true)}
              data-testid="enviar-informe-btn"
            >
              Enviar por mail
            </button>
            {#if !hasValidEmail}
              <span class="text-xs text-[var(--sys-text-muted-light)]">
                La empresa no tiene email registrado.
              </span>
            {/if}
          </div>
          {#if data.informeEnvios.length > 0}
            <div class="space-y-1" data-testid="informe-enviado-lista">
              <p class="text-xs font-medium text-sys-profundo">Informe enviado:</p>
              {#each data.informeEnvios as envio}
                <p class="text-xs text-[var(--sys-text-muted-light)]" data-testid="informe-enviado-item">
                  {envio.toEmail} — {new Date(envio.at).toLocaleString('es-AR')}
                  <span class="ml-1 text-xs {envio.status === 'enviado' ? 'text-emerald-600' : envio.status === 'dry_run' ? 'text-sys-electrico' : 'text-sys-rojo'}">
                    ({envio.status})
                  </span>
                </p>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      {#if data.isAdmin}
        <div class="sys-card-pad flex flex-wrap items-center gap-3">
          <span class="text-sm text-sys-medio">
            {ejemplar ? 'Marcado como informe ejemplar para few-shot IA.' : 'No es ejemplar.'}
          </span>
          <button
            type="button"
            class="sys-btn-secondary"
            disabled={busy}
            data-testid="toggle-ejemplar"
            onclick={() =>
              call(`${base}/${data.version}/ejemplar`, 'POST', { ejemplar: !ejemplar })}
          >
            {ejemplar ? 'Quitar ejemplar' : 'Marcar ejemplar'}
          </button>
        </div>
      {/if}
    {/if}

    {#if tab === 'cliente'}
      {#if status === 'borrador'}
        <div class="sys-card-pad space-y-4">
          <h2 class="sys-section-title">Editar por sección</h2>
          {#if model}
            <SectionEditor
              draft={model.draft}
              auditId={data.auditId}
              version={data.version}
              onSaved={onSectionSaved}
            />
          {/if}
          <label class="block max-w-xl space-y-1.5">
            <span class="sys-field-label">URL de Loom (opcional)</span>
            <div class="flex gap-2">
              <input
                class="sys-field"
                placeholder="https://www.loom.com/share/…"
                bind:value={loomInput}
              />
              <button
                type="button"
                class="sys-btn-secondary"
                disabled={busy}
                onclick={() =>
                  call(`${base}/${data.version}`, 'PATCH', {
                    loom_url: loomInput.trim() === '' ? null : loomInput.trim()
                  })}
              >
                Guardar
              </button>
            </div>
          </label>
        </div>
      {/if}

      {#if model}
        {#if editMode && status === 'borrador'}
          <InlineEditor {model} auditId={data.auditId} version={data.version} onDone={onInlineDone} />
        {:else}
          <ReportRender {model} />
        {/if}
      {/if}
    {:else}
      <InternalView upsellFindings={data.upsellFindings} internalDraft={data.internalDraft} />
    {/if}
  {/if}
</div>

{#if showEnviarDialog && data.empresaEmail}
  <EnviarInformeDialog
    auditId={data.auditId}
    version={data.version}
    empresaEmail={data.empresaEmail}
    onSent={onEnviarSent}
    onError={onEnviarError}
    onClose={() => (showEnviarDialog = false)}
  />
{/if}

{#if toast}
  <div
    class="fixed bottom-16 right-4 z-50 max-w-sm rounded-sys-app px-4 py-3 text-white shadow-lg md:bottom-4"
    class:bg-sys-rojo={toast.type === 'error'}
    class:bg-emerald-600={toast.type === 'success'}
    role="alert"
    data-toast={toast.type}
  >
    {toast.message}
  </div>
{/if}
