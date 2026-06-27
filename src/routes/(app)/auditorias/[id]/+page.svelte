<script lang="ts">
  import type { PageData } from './$types';
  import AuditStatusBadge from '$lib/components/backoffice/audit-status-badge.svelte';
  import AuditProgressBar from '$lib/components/backoffice/audit-progress-bar.svelte';
  import CabSectionForm from '$lib/components/backoffice/cab-section-form.svelte';
  import CopyLinkButton from '$lib/components/backoffice/copy-link-button.svelte';
  import InformeSection from '$lib/components/informe/informe-section.svelte';
  import PsysCard from '$lib/components/auditoria/psys-card.svelte';
  import AuditBundleActions from '$lib/components/backoffice/audit-bundle-actions.svelte';
  import { formatVisita } from '$lib/informe/visita';
  import { toDatetimeLocalValue } from '$lib/datetime-local';

  let { data, form }: {
    data: PageData;
    form?: { error?: string; url?: string; success?: boolean; status?: string; sentTo?: string }
  } = $props();

  // #52 R1, R2, R10: modal de envío de briefing por email
  let showBriefingEmailModal = $state(false);
  let briefingEmailTo = $state(data.contactEmail ?? '');

  // Toast de resultado (#38)
  let toastMessage = $state<string | null>(null);
  let toastType = $state<'success' | 'error'>('success');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error') {
    toastMessage = message;
    toastType = type;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = null;
    }, 4000);
  }

  // Reaccionar al resultado del form action
  $effect(() => {
    if (form && 'status' in form) {
      if (form.success) {
        showToast(`Briefing enviado a ${form.sentTo}`, 'success');
        showBriefingEmailModal = false;
      } else if (form.error) {
        showToast(form.error, 'error');
      }
    }
  });

  const scheduledValue = $derived(
    data.audit.scheduledAt
      ? new Date(data.audit.scheduledAt).toISOString().slice(0, 10)
      : ''
  );

  const startedAtValue = $derived(
    data.startedAt ? toDatetimeLocalValue(new Date(data.startedAt)) : ''
  );

  const finishedAtValue = $derived(
    data.finishedAt ? toDatetimeLocalValue(new Date(data.finishedAt)) : ''
  );

  const visita = $derived(
    formatVisita({
      startedAt: data.startedAt ? new Date(data.startedAt) : null,
      finishedAt: data.finishedAt ? new Date(data.finishedAt) : null
    })
  );
</script>

<svelte:head>
  <title>{data.audit.razonSocial} — auditapp</title>
</svelte:head>

<div class="max-w-3xl space-y-8">
  <div class="flex items-start justify-between gap-4">
    <div class="space-y-1">
      <h1 class="sys-page-title">{data.audit.razonSocial}</h1>
      <p class="font-mono text-sm text-sys-electrico">{data.audit.refCode}</p>
      <p class="sys-muted">{data.audit.types.join(', ')} · Seg. {data.audit.segment}</p>
    </div>
    <AuditStatusBadge status={data.audit.status} />
  </div>

  <AuditProgressBar progress={data.audit.progress} />

  {#if form?.error}
    <p class="text-sm text-sys-rojo" role="alert">{form.error}</p>
  {/if}

  {#if data.readonly}
    <p class="rounded-sys-app border border-sys-naranja/20 bg-sys-naranja/10 p-4 text-sm text-sys-medio">
      Esta auditoría está cerrada. Solo lectura.
    </p>
  {/if}

  <section class="sys-card-pad space-y-4">
    <h2 class="sys-section-title">Briefing</h2>
    {#if data.audit.status === 'borrador'}
      <form method="POST" action="?/generateBriefingLink">
        <button type="submit" class="text-sm font-medium text-sys-electrico hover:underline">
          Generar link de briefing
        </button>
      </form>
      <form method="POST" action="?/completarBriefingInternamente" class="mt-2">
        <button type="submit" class="text-sm text-sys-medio hover:text-sys-electrico hover:underline">
          Completar briefing internamente
        </button>
      </form>
    {:else if data.audit.status === 'briefing_enviado' || data.audit.status === 'briefing_completo'}
      {#if data.briefingUrl}
        <CopyLinkButton url={data.briefingUrl} />
        <form method="POST" action="?/regenerateBriefingLink" class="mt-2">
          <button type="submit" class="text-sm text-[var(--sys-text-muted-light)] hover:text-sys-electrico hover:underline">
            Regenerar link
          </button>
        </form>
        <!-- #52 R1, R2: botón "Enviar briefing por mail" -->
        <div class="mt-3">
          <button
            type="button"
            class="text-sm font-medium text-sys-electrico hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!data.canSendBriefingEmail}
            onclick={() => {
              briefingEmailTo = data.contactEmail ?? '';
              showBriefingEmailModal = true;
            }}
          >
            Enviar briefing por mail
          </button>
          {#if !data.canSendBriefingEmail && !data.contactEmail}
            <p class="mt-1 text-xs text-sys-medio">El cliente no tiene email registrado.</p>
          {/if}
          {#if data.briefingEmail}
            <p class="mt-1 text-xs text-sys-medio">
              Briefing enviado a <span class="font-medium">{data.briefingEmail.sentTo}</span> el
              {new Date(data.briefingEmail.sentAt).toLocaleDateString('es-AR')}
            </p>
          {/if}
        </div>
      {/if}
      {#if data.audit.status === 'briefing_enviado'}
        <form method="POST" action="?/completarBriefingInternamente" class="mt-2">
          <button type="submit" class="text-sm text-sys-medio hover:text-sys-electrico hover:underline">
            Completar briefing internamente
          </button>
        </form>
      {/if}
    {/if}
    {#if data.audit.status === 'briefing_completo' || data.audit.status === 'en_relevamiento' || data.audit.status === 'en_cierre'}
      <a href="/auditorias/{data.audit.id}/form" class="sys-btn-accent">Abrir relevamiento técnico</a>
      <a href="/auditorias/{data.audit.id}/reunion" class="sys-btn-secondary mt-2">Asistente de reunión</a>
      {#if data.reunionSessions && data.reunionSessions.length > 0}
        <div class="mt-3 space-y-1">
          <p class="text-xs text-sys-medio font-medium">Sesiones de reunión</p>
          {#each data.reunionSessions as s}
            <a href="/auditorias/{data.audit.id}/reunion/{s.id}" class="flex items-center justify-between rounded bg-sys-fondo px-3 py-1.5 text-xs hover:bg-sys-borde">
              <span class="text-sys-oscuro capitalize">{s.session_type}</span>
              <span class="text-sys-medio">{new Date(s.created_at).toLocaleDateString('es-AR')} · {s.status}</span>
            </a>
          {/each}
        </div>
      {/if}
    {/if}
    {#if data.audit.status === 'en_cierre' || data.audit.status === 'cerrada'}
      <a href="/auditorias/{data.audit.id}/cierre" class="sys-btn-secondary mt-2">Pantalla de cierre</a>
    {/if}
    {#if data.audit.status === 'cerrada' && data.canViewRelevamientoReadonly}
      <a href="/auditorias/{data.audit.id}/form-readonly" class="sys-btn-secondary mt-2 block">
        Ver relevamiento (solo lectura)
      </a>
    {/if}
    {#if data.audit.status === 'cerrada' && data.canReopenAudit}
      <form method="POST" action="?/reopenAudit" class="mt-2"
        onsubmit={(e) => !confirm('¿Reabrir esta auditoría? Los informes generados quedarán marcados como posiblemente desactualizados.') && e.preventDefault()}>
        <button type="submit" class="text-sm font-medium text-sys-naranja hover:underline">
          Reabrir auditoría
        </button>
      </form>
    {/if}
  </section>

  {#if data.audit.status === 'cerrada'}
    <InformeSection
      auditId={data.audit.id}
      reports={data.reports}
      isAdmin={data.isAdmin}
      canGenerate={data.isAdmin && data.audit.status === 'cerrada'}
    />
    <PsysCard
      auditId={data.audit.id}
      isAdmin={data.isAdmin}
      hasApprovedReport={data.hasApprovedReport}
      proposalLink={data.proposalLink}
    />
  {/if}

  {#if visita}
    <section class="sys-card-pad">
      <p class="text-sm text-sys-medio">{visita.rangoStr}</p>
    </section>
  {/if}

  {#if !data.readonly}
    <form method="POST" action="?/update" class="space-y-5">
      <label class="block space-y-1.5">
        <span class="sys-field-label">Segmento</span>
        <select name="segment" class="sys-field">
          {#each ['A', 'B', 'C'] as seg}
            <option value={seg} selected={data.audit.segment === seg}>{seg}</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1.5">
        <span class="sys-field-label">Técnico asignado</span>
        <select name="assignedTechId" class="sys-field">
          {#each data.technicians as tech}
            <option value={tech.id} selected={data.audit.assignedTechId === tech.id}>
              {tech.name}
            </option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1.5">
        <span class="sys-field-label">Fecha de visita</span>
        <input type="date" name="scheduledAt" value={scheduledValue} class="sys-field" />
      </label>

      <CabSectionForm items={data.audit.cabItems} />

      {#if data.canEditVisita}
        <label class="block space-y-1.5">
          <span class="sys-field-label">Hora de inicio del relevamiento</span>
          <input type="datetime-local" name="startedAt" value={startedAtValue} class="sys-field" />
        </label>

        <label class="block space-y-1.5">
          <span class="sys-field-label">Hora de fin del relevamiento</span>
          <input type="datetime-local" name="finishedAt" value={finishedAtValue} class="sys-field" />
        </label>
      {/if}

      <button type="submit" class="sys-btn-primary">Guardar cambios</button>
    </form>
  {:else}
    <CabSectionForm items={data.audit.cabItems} readonly />
  {/if}

  {#if data.isAdmin}
    <AuditBundleActions auditId={data.audit.id} />
  {/if}

  {#if !data.audit.archivedAt}
    <form
      method="POST"
      action="?/archive"
      onsubmit={(e) => !confirm('¿Archivar esta auditoría?') && e.preventDefault()}
    >
      <button type="submit" class="text-sm text-sys-rojo hover:underline">Archivar auditoría</button>
    </form>
  {/if}
</div>

<!-- #52 R10: modal de confirmación para envío de briefing por email -->
{#if showBriefingEmailModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    role="dialog"
    aria-modal="true"
    aria-label="Enviar briefing por email"
  >
    <div class="w-full max-w-md rounded-sys-app bg-sys-blanco p-6 shadow-xl">
      <h3 class="sys-section-title mb-4">Enviar briefing por mail</h3>
      <p class="mb-4 text-sm text-sys-medio">
        Se enviará el link de briefing al contacto del cliente. Podés editar el destinatario antes de confirmar.
      </p>
      <form
        method="POST"
        action="?/enviarBriefingEmail"
        onsubmit={() => { showBriefingEmailModal = false; }}
      >
        <label class="block text-sm font-medium text-sys-oscuro" for="briefing-email-to">
          Destinatario
        </label>
        <input
          id="briefing-email-to"
          name="to"
          type="email"
          required
          class="sys-input mt-1 w-full"
          bind:value={briefingEmailTo}
        />
        <div class="mt-6 flex gap-3">
          <button type="submit" class="sys-btn-accent flex-1">Enviar</button>
          <button
            type="button"
            class="sys-btn-secondary flex-1"
            onclick={() => { showBriefingEmailModal = false; }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- #38/#52 R10: toast de resultado -->
{#if toastMessage}
  <div
    class="fixed bottom-6 right-6 z-50 max-w-sm rounded-sys-app px-4 py-3 text-sm shadow-lg {toastType === 'success' ? 'bg-sys-verde text-white' : 'bg-sys-rojo text-white'}"
    role="alert"
    aria-live="polite"
  >
    {toastMessage}
  </div>
{/if}
