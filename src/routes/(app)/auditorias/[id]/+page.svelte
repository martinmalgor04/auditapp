<script lang="ts">
  import type { PageData } from './$types';
  import AuditStatusBadge from '$lib/components/backoffice/audit-status-badge.svelte';
  import AuditProgressBar from '$lib/components/backoffice/audit-progress-bar.svelte';
  import CabSectionForm from '$lib/components/backoffice/cab-section-form.svelte';
  import CopyLinkButton from '$lib/components/backoffice/copy-link-button.svelte';

  let { data, form }: { data: PageData; form?: { error?: string; url?: string } } = $props();

  const scheduledValue = $derived(
    data.audit.scheduledAt
      ? new Date(data.audit.scheduledAt).toISOString().slice(0, 10)
      : ''
  );
</script>

<svelte:head>
  <title>{data.audit.razonSocial} — auditapp</title>
</svelte:head>

<div class="space-y-6 max-w-3xl">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">{data.audit.razonSocial}</h1>
      <p class="text-sm text-slate-600">{data.audit.types.join(', ')} · Seg. {data.audit.segment}</p>
    </div>
    <AuditStatusBadge status={data.audit.status} />
  </div>

  <AuditProgressBar progress={data.audit.progress} />

  {#if form?.error}
    <p class="text-sm text-red-600" role="alert">{form.error}</p>
  {/if}

  {#if data.readonly}
    <p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
      Esta auditoría está cerrada. Solo lectura.
    </p>
  {/if}

  <section class="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
    <h2 class="font-semibold text-slate-800">Briefing</h2>
    {#if data.audit.status === 'borrador'}
      <form method="POST" action="?/generateBriefingLink">
        <button type="submit" class="text-sm text-blue-700 underline">Generar link de briefing</button>
      </form>
    {:else if data.audit.status === 'briefing_enviado' || data.audit.status === 'briefing_completo'}
      {#if data.briefingUrl}
        <CopyLinkButton url={data.briefingUrl} />
        <form method="POST" action="?/regenerateBriefingLink" class="mt-2">
          <button type="submit" class="text-sm text-slate-600 underline">Regenerar link</button>
        </form>
      {/if}
    {/if}
    {#if data.audit.status === 'briefing_completo' || data.audit.status === 'en_relevamiento' || data.audit.status === 'en_cierre'}
      <a
        href="/auditorias/{data.audit.id}/form"
        class="inline-flex min-h-[var(--sys-touch-min)] items-center rounded bg-[var(--sys-primary)] px-4 py-2 text-sm font-medium text-white"
      >
        Abrir relevamiento técnico
      </a>
    {/if}
  </section>

  {#if !data.readonly}
    <form method="POST" action="?/update" class="space-y-4">
      <label class="block space-y-1">
        <span class="text-sm font-medium text-slate-700">Segmento</span>
        <select name="segment" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          {#each ['A', 'B', 'C'] as seg}
            <option value={seg} selected={data.audit.segment === seg}>{seg}</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium text-slate-700">Técnico asignado</span>
        <select name="assignedTechId" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          {#each data.technicians as tech}
            <option value={tech.id} selected={data.audit.assignedTechId === tech.id}>
              {tech.name}
            </option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium text-slate-700">Fecha de visita</span>
        <input
          type="date"
          name="scheduledAt"
          value={scheduledValue}
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <CabSectionForm items={data.audit.cabItems} />

      <button
        type="submit"
        class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Guardar cambios
      </button>
    </form>
  {:else}
    <CabSectionForm items={data.audit.cabItems} readonly />
  {/if}

  {#if data.isAdmin && !data.audit.archivedAt}
    <form method="POST" action="?/archive" onsubmit={(e) => !confirm('¿Archivar esta auditoría?') && e.preventDefault()}>
      <button type="submit" class="text-sm text-red-700 underline">Archivar auditoría</button>
    </form>
  {/if}
</div>
