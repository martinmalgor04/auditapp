<script lang="ts">
  // Modo edición inline estilo presupuestossys (R30, R31): contenteditable por bloque
  // data-field, autosave con debounce 1 s vía PATCH origin:'inline', botón «Listo».
  import ReportRender from './report-render.svelte';
  import type { InformeRenderModel } from '$lib/informe/render';
  import {
    INLINE_AUTOSAVE_DEBOUNCE_MS,
    debounce,
    getFieldFromDraft,
    serializeBlockText,
    setFieldOnDraft
  } from '$lib/client/informe/inline-edit';

  let {
    model,
    auditId,
    version,
    onDone
  }: {
    model: InformeRenderModel;
    auditId: string;
    version: number;
    onDone: (draft: InformeRenderModel['draft']) => void;
  } = $props();

  let draft = $state(structuredClone($state.snapshot(model).draft));
  let feedback = $state('');
  let errorMessage = $state('');
  let container: HTMLDivElement;

  const renderModel = $derived({ ...model, draft });

  async function persist(path: string, el: HTMLElement): Promise<void> {
    const text = serializeBlockText(el);
    let next: typeof draft;
    try {
      // $state.snapshot: structuredClone falla sobre el proxy reactivo de Svelte 5.
      next = setFieldOnDraft($state.snapshot(draft) as typeof draft, path, text);
    } catch {
      return;
    }
    const res = await fetch(`/api/audits/${auditId}/report/${version}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_draft: next, origin: 'inline' })
    });
    if (res.ok) {
      const body = (await res.json()) as { data: { seq?: number } };
      draft = next;
      errorMessage = '';
      el.classList.remove('informe-field-error');
      feedback = `Guardado (edición ${body.data.seq ?? ''})`.trim().replace(/\s+\)/, ')');
    } else {
      // Error Zod: marca el bloque y revierte al último valor persistido.
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      errorMessage = body?.error ?? 'No se pudo guardar';
      el.classList.add('informe-field-error');
      const prev = getFieldFromDraft(draft, path);
      el.textContent = typeof prev === 'string' ? prev : '';
    }
  }

  const debouncedPersist = debounce((path: string, el: HTMLElement) => {
    void persist(path, el);
  }, INLINE_AUTOSAVE_DEBOUNCE_MS);

  function onInput(event: Event): void {
    const target = (event.target as HTMLElement).closest('[data-field]') as HTMLElement | null;
    if (!target) return;
    const path = target.dataset.field;
    if (!path) return;
    feedback = 'Editando…';
    debouncedPersist(path, target);
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between gap-3">
    <div class="text-sm">
      {#if errorMessage}
        <span class="font-medium text-sys-rojo">{errorMessage}</span>
      {:else if feedback}
        <span class="text-sys-verde" data-testid="inline-feedback">{feedback}</span>
      {:else}
        <span class="text-sys-medio">Tocá un bloque de texto para editarlo. Se guarda solo.</span>
      {/if}
    </div>
    <button type="button" class="sys-btn-primary" onclick={() => onDone(draft)}>Listo</button>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={container} oninput={onInput}>
    <ReportRender model={renderModel} editMode={true} />
  </div>
</div>
