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

  let { data, form }: { data: PageData; form?: { error?: string; url?: string } } = $props();

  const scheduledValue = $derived(
    data.audit.scheduledAt
      ? new Date(data.audit.scheduledAt).toISOString().slice(0, 10)
      : ''
  );

  const startedAtValue = $derived(
    data.startedAt
      ? new Date(data.startedAt).toISOString().slice(0, 16)
      : ''
  );

  const finishedAtValue = $derived(
    data.finishedAt
      ? new Date(data.finishedAt).toISOString().slice(0, 16)
      : ''
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
    {:else if data.audit.status === 'briefing_enviado' || data.audit.status === 'briefing_completo'}
      {#if data.briefingUrl}
        <CopyLinkButton url={data.briefingUrl} />
        <form method="POST" action="?/regenerateBriefingLink" class="mt-2">
          <button type="submit" class="text-sm text-[var(--sys-text-muted-light)] hover:text-sys-electrico hover:underline">
            Regenerar link
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
