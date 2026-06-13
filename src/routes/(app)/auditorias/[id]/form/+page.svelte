<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import FieldRenderer from '$lib/components/form/field-renderer.svelte';
  import ExportImportPanel from '$lib/components/form/export-import-panel.svelte';
  import LiveSectionScore from '$lib/components/form/live-section-score.svelte';
  import SaveIndicator, { type SaveIndicatorState } from '$lib/components/form/save-indicator.svelte';
  import SectionNav from '$lib/components/form/section-nav.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import { createAutosave } from '$lib/client/form/autosave';
  import {
    downloadBackupJson,
    importBackupViaApi,
    mergeResponsesForExport,
    validateBackupJson
  } from '$lib/client/form/backup';
  import { updateScoreFromApi } from '$lib/client/form/live-score';
  import { prepareImageForUpload } from '$lib/client/form/image-pipeline';
  import { uploadPhotoFlow, type PhotoTableRow } from '$lib/client/form/photo-upload';
  import { deleteAttachmentFlow } from '$lib/client/form/attachment-delete';
  import { enqueueSave, flushQueue, listQueued, registerOnlineFlush } from '$lib/client/form/retry-queue';
  import type { PageData } from './$types';

  let { data, form }: { data: PageData; form?: { error?: string; warnings?: Array<{ label: string }> } } =
    $props();

  let activeSectionId = $state(data.sections[0]?.id ?? '');
  let saveState = $state<SaveIndicatorState>('idle');
  let saveErrorMessage = $state<string | null>(null);
  let sectionScores = $state(
    new Map(data.sections.map((s) => [s.id, { sectionId: s.id, score: s.liveScore, band: s.scoreBand }]))
  );

  const activeSection = $derived(data.sections.find((s) => s.id === activeSectionId) ?? data.sections[0]);

  const activeSectionIndex = $derived(data.sections.findIndex((s) => s.id === activeSectionId));

  const isFirstSection = $derived(activeSectionIndex <= 0);
  const isLastSection = $derived(activeSectionIndex >= data.sections.length - 1);

  function goToSection(index: number) {
    const section = data.sections[index];
    if (!section) return;
    activeSectionId = section.id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToPrevSection() {
    if (!isFirstSection) goToSection(activeSectionIndex - 1);
  }

  function goToNextSection() {
    if (!isLastSection) goToSection(activeSectionIndex + 1);
  }

  const autosave = createAutosave(data.auditId, {
    onStateChange: (s, message) => {
      saveState = s;
      saveErrorMessage = s === 'error' ? (message ?? 'Error al guardar') : null;
    },
    onSectionScore: (sectionId, score, band) => {
      sectionScores = updateScoreFromApi(sectionScores, sectionId, score, band);
    }
  });

  $effect(() => {
    const cleanup = registerOnlineFlush(data.auditId, autosave.patch, () => {
      saveState = 'saved';
    });
    void flushQueue(data.auditId, autosave.patch);
    return cleanup;
  });

  async function saveItem(
    itemId: string,
    fieldType: string,
    value: unknown,
    na = false,
    notes?: string | null
  ) {
    const payload = { itemId, value, na, notes };
    const outcome = await autosave.patch(payload);
    if (outcome === 'offline') {
      // Solo errores de red/5xx se encolan; un 4xx ('rejected') ya mostró
      // error visible y reintentarlo daría siempre el mismo rechazo.
      await enqueueSave({
        auditId: data.auditId,
        ...payload,
        enqueuedAt: new Date().toISOString(),
        attempts: 0
      });
      saveState = 'offline';
    }
    return outcome;
  }

  async function handleExport() {
    const serverResponses = data.sections.flatMap((s) =>
      s.items.map((it) => ({
        itemId: it.id,
        value: it.value,
        na: it.na,
        notes: it.notes
      }))
    );
    const queued = await listQueued(data.auditId);
    const backup = mergeResponsesForExport(data.auditId, serverResponses, queued);
    await downloadBackupJson(backup);
  }

  async function handleImport(file: File) {
    const text = await file.text();
    const backup = validateBackupJson(JSON.parse(text));
    const res = await importBackupViaApi(data.auditId, backup);
    if (res.ok) {
      await invalidateAll();
    }
  }

  async function uploadPhoto(
    itemId: string,
    sectionCode: string,
    file: File,
    rowId?: string,
    currentRows?: PhotoTableRow[]
  ): Promise<{ rows: PhotoTableRow[] } | null> {
    saveState = 'saving';
    saveErrorMessage = null;
    try {
      // Persistir la grilla viva antes del confirm (celdas recién tipeadas).
      if (rowId && currentRows && currentRows.length > 0) {
        const preSave = await saveItem(itemId, 'table', { rows: currentRows }, false);
        if (preSave === 'rejected') return null;
      }

      const prepared = await prepareImageForUpload(file);
      const result = await uploadPhotoFlow({
        auditId: data.auditId,
        itemId,
        sectionCode,
        prepared,
        rowId,
        currentRows
      });

      if (!result.ok) {
        saveState = 'error';
        saveErrorMessage = result.error;
        return null;
      }

      if (result.mergedValue) {
        // Merge sobre las filas VIVAS del FieldRenderer (nunca el snapshot del load).
        const outcome = await saveItem(itemId, 'table', result.mergedValue, false);
        if (outcome === 'rejected') return null;
        await invalidateAll();
        return result.mergedValue;
      }

      saveState = 'saved';
      await invalidateAll();
      return null;
    } catch (err) {
      saveState = 'error';
      saveErrorMessage =
        err instanceof Error ? `Error subiendo la foto: ${err.message}` : 'Error subiendo la foto';
      return null;
    }
  }

  function pickPhoto(
    itemId: string,
    sectionCode: string,
    rowId?: string,
    currentRows?: PhotoTableRow[]
  ): Promise<{ rows: PhotoTableRow[] } | void> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          void uploadPhoto(itemId, sectionCode, file, rowId, currentRows).then((merged) =>
            resolve(merged ?? undefined)
          );
        } else {
          resolve(undefined);
        }
      };
      input.click();
    });
  }

  async function deletePhoto(
    itemId: string,
    attachmentId: string,
    rowId?: string,
    currentRows?: PhotoTableRow[]
  ): Promise<{ rows?: PhotoTableRow[] } | null> {
    saveState = 'saving';
    saveErrorMessage = null;
    try {
      const result = await deleteAttachmentFlow({
        auditId: data.auditId,
        itemId,
        attachmentId,
        rowId
      });
      if (!result.ok) {
        saveState = 'error';
        saveErrorMessage = result.error;
        return null;
      }

      saveState = 'saved';
      await invalidateAll();

      if (rowId && currentRows) {
        return {
          rows: currentRows.map((row) =>
            row.row_id === rowId
              ? {
                  ...row,
                  attachment_ids: row.attachment_ids.filter((id) => id !== attachmentId)
                }
              : row
          )
        };
      }

      return {};
    } catch (err) {
      saveState = 'error';
      saveErrorMessage =
        err instanceof Error ? `Error al borrar la foto: ${err.message}` : 'Error al borrar la foto';
      return null;
    }
  }

  const activeScore = $derived(sectionScores.get(activeSection?.id ?? '') ?? {
    score: activeSection?.liveScore ?? null,
    band: activeSection?.scoreBand ?? 'na'
  });
</script>

<svelte:head>
  <title>Relevamiento — {data.audit.razonSocial}</title>
</svelte:head>

<div class="sticky top-0 z-30 -mx-4 mb-4 border-b border-sys-medio/10 bg-sys-offwhite px-4 py-2">
  <SaveIndicator state={saveState} errorMessage={saveErrorMessage} />
</div>

<div class="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
  <aside class="sticky top-12 z-20 -mx-4 mb-4 border-b border-sys-medio/10 bg-sys-offwhite px-4 pb-3 lg:top-16 lg:z-auto lg:mx-0 lg:mb-0 lg:border-0 lg:px-0 lg:pb-0 lg:self-start">
    <SectionNav
      sections={data.sections}
      {activeSectionId}
      progressPct={data.progressPct}
      onselect={(id) => (activeSectionId = id)}
    />
  </aside>

  <div class="space-y-4">
    {#if form?.error}
      <p class="text-sm text-red-600" role="alert">{form.error}</p>
    {/if}
    {#if form?.warnings?.length}
      <div class="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p class="font-medium">Ítems requeridos pendientes:</p>
        <ul class="list-disc pl-5">
          {#each form.warnings as w}
            <li>{w.label}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="flex items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold">{activeSection?.code} — {activeSection?.title}</h1>
        <p class="text-sm text-slate-600">{data.audit.razonSocial}</p>
      </div>
      <LiveSectionScore score={activeScore.score} band={activeScore.band} />
    </div>

    <ExportImportPanel onexport={() => void handleExport()} onimport={(f) => void handleImport(f)} />

    <div class="space-y-4">
      {#each activeSection?.items ?? [] as item (item.id)}
        <FieldRenderer
          item={{
            ...item,
            value: item.value,
            method: item.method,
            allowNa: item.allowNa,
            preloaded: item.preloaded,
            notes: item.notes,
            na: item.na
          }}
          onchange={(value) => void saveItem(item.id, item.fieldType, value, item.na, item.notes)}
          onnchange={(na) => void saveItem(item.id, item.fieldType, null, na, item.notes)}
          onnoteschange={(notes) => void saveItem(item.id, item.fieldType, item.value, item.na, notes)}
          oncamera={(rowId, currentRows) =>
            pickPhoto(item.id, activeSection?.code ?? '', rowId, currentRows as PhotoTableRow[])}
          onphotocapture={() => pickPhoto(item.id, activeSection?.code ?? '')}
          onphotogallery={() => pickPhoto(item.id, activeSection?.code ?? '')}
          onphotodelete={(attachmentId, rowId, currentRows) =>
            deletePhoto(item.id, attachmentId, rowId, currentRows as PhotoTableRow[] | undefined)}
        />
      {/each}
    </div>

    {#if data.sections.length > 1}
      <div class="flex gap-3 pt-2" data-section-step>
        {#if !isFirstSection}
          <SysButton type="button" variant="secondary" class="flex-1" onclick={goToPrevSection}>
            Anterior
          </SysButton>
        {/if}
        {#if !isLastSection}
          <SysButton type="button" variant="primary" class="flex-1" onclick={goToNextSection}>
            Siguiente
          </SysButton>
        {/if}
      </div>
    {/if}

    <form method="POST" action="?/complete" use:enhance class="sticky bottom-4 pt-4">
      <SysButton type="submit" variant="primary" class="w-full shadow-md">
        Relevamiento completo
      </SysButton>
    </form>
  </div>
</div>
