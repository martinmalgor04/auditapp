<script lang="ts">
  // Edición por sección (R20): edita campos de texto del draft y manda el draft
  // completo al PATCH (origin: 'form').
  import type { RenderClientDraft } from '$lib/informe/render';

  let {
    draft,
    auditId,
    version,
    onSaved
  }: {
    draft: RenderClientDraft;
    auditId: string;
    version: number;
    onSaved: (draft: RenderClientDraft) => void;
  } = $props();

  let working = $state(structuredClone($state.snapshot(draft) as RenderClientDraft));
  let saving = $state(false);
  let message = $state('');

  async function save(): Promise<void> {
    saving = true;
    message = '';
    try {
      const res = await fetch(`/api/audits/${auditId}/report/${version}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_draft: working, origin: 'form' })
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        data?: { client_draft: RenderClientDraft };
      } | null;
      if (res.ok && body?.data) {
        message = 'Sección guardada';
        onSaved(body.data.client_draft);
      } else {
        message = body?.error ?? 'No se pudo guardar';
      }
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-3" data-testid="section-editor">
  <label class="block space-y-1.5">
    <span class="sys-field-label">Diagnóstico central (una línea, ≤90)</span>
    <input class="sys-field" maxlength="90" bind:value={working.resumen.diagnostico} />
  </label>
  <label class="block space-y-1.5">
    <span class="sys-field-label">Lead del resumen</span>
    <textarea class="sys-field" rows="3" bind:value={working.resumen.lead}></textarea>
  </label>
  <label class="block space-y-1.5">
    <span class="sys-field-label">Interpretación del índice</span>
    <textarea class="sys-field" rows="3" bind:value={working.resumen.interpretacion}></textarea>
  </label>
  <label class="block space-y-1.5">
    <span class="sys-field-label">Recomendación central</span>
    <textarea class="sys-field" rows="2" bind:value={working.resumen.recomendacion_central}
    ></textarea>
  </label>
  <label class="block space-y-1.5">
    <span class="sys-field-label">Intro de riesgos</span>
    <textarea class="sys-field" rows="2" bind:value={working.riesgos.intro}></textarea>
  </label>
  <label class="block space-y-1.5">
    <span class="sys-field-label">Título del plan</span>
    <input class="sys-field" bind:value={working.plan.titulo} />
  </label>
  <label class="block space-y-1.5">
    <span class="sys-field-label">Descripción del plan</span>
    <textarea class="sys-field" rows="3" bind:value={working.plan.descripcion}></textarea>
  </label>

  <div class="flex items-center gap-3">
    <button type="button" class="sys-btn-primary" onclick={save} disabled={saving}>
      {saving ? 'Guardando…' : 'Guardar sección'}
    </button>
    {#if message}<span class="text-sm text-sys-medio">{message}</span>{/if}
  </div>
</div>
