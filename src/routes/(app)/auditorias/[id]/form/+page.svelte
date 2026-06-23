<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import FieldRenderer from '$lib/components/form/field-renderer.svelte';
  import ExportImportPanel from '$lib/components/form/export-import-panel.svelte';
  import LiveSectionScore from '$lib/components/form/live-section-score.svelte';
  import SaveIndicator, { type SaveIndicatorState } from '$lib/components/form/save-indicator.svelte';
  import SaveErrorToast from '$lib/components/form/SaveErrorToast.svelte';
  import QueuePendingIndicator from '$lib/components/form/QueuePendingIndicator.svelte';
  import DraftRecoveryBanner from '$lib/components/form/DraftRecoveryBanner.svelte';
  import SectionNav from '$lib/components/form/section-nav.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import { createAutosave } from '$lib/client/form/autosave';
  import {
    downloadBackupJson,
    importBackupViaApi,
    mergeResponsesForExport,
    validateBackupJson
  } from '$lib/client/form/backup';
  import {
    deleteDraft,
    loadDraft,
    saveDraft,
    type FormDraft
  } from '$lib/client/form/draft-store';
  import { restoreDraft, buildDraftPayload, maybeDeleteDraftWhenSynced, discardPendingDraft, resolvePendingDraftOnMount } from '$lib/client/form/draft-recovery';
  import { updateScoreFromApi } from '$lib/client/form/live-score';
  import { itemStatus, sectionProgress } from '$lib/client/form/item-status';
  import { nextPending } from '$lib/client/form/next-pending';
  import { prepareImageForUpload } from '$lib/client/form/image-pipeline';
  import { uploadPhotoFlow, type PhotoTableRow } from '$lib/client/form/photo-upload';
  import { deleteAttachmentFlow } from '$lib/client/form/attachment-delete';
  import { enqueueSave, flushQueue, listQueued, registerOnlineFlush, type QueuedSave } from '$lib/client/form/retry-queue';
  import type { PageData } from './$types';

  let { data, form }: { data: PageData; form?: { error?: string; warnings?: Array<{ label: string }> } } =
    $props();

  let activeSectionId = $state(data.sections[0]?.id ?? '');
  let saveState = $state<SaveIndicatorState>('idle');
  let savingItemId = $state<string | null>(null);
  let saveErrorMessage = $state<string | null>(null);
  let retryQueue = $state<QueuedSave[]>([]);
  let toastOpen = $state(false);
  let pendingDraft = $state<FormDraft | null>(null);
  let sectionScores = $state(
    new Map(data.sections.map((s) => [s.id, { sectionId: s.id, score: s.liveScore, band: s.scoreBand }]))
  );

  // T8 — Estado local de ítems para chips reactivos (R6, R20, R23)
  let itemLocalState = $state(
    new Map(
      data.sections.flatMap((s) =>
        s.items.map((it) => [it.id, { value: it.value, na: it.na ?? false, notes: it.notes ?? null }])
      )
    )
  );

  const itemStatuses = $derived(
    new Map(
      [...itemLocalState.entries()].map(([id, it]) => [id, itemStatus(it)])
    )
  );

  const progressBySec = $derived(
    new Map(
      data.sections.map((sec) => [
        sec.id,
        sectionProgress(
          sec.items.map((it) => itemLocalState.get(it.id) ?? { value: it.value, na: it.na ?? false, notes: it.notes ?? null })
        )
      ])
    )
  );

  // T10 — Animación del score (R14, R15, R23)
  let animatingSectionId = $state<string | null>(null);

  // T11 — Próximo pendiente (R8–R12)
  let lastVisitedItemIndex = $state(-1);
  let noPendingMessage = $state(false);

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
      toastOpen = s === 'error';
      // Limpiar savingItemId cuando el estado vuelve a idle (R1, R10)
      if (s === 'idle') savingItemId = null;
    },
    onSectionScore: (sectionId, score, band) => {
      sectionScores = updateScoreFromApi(sectionScores, sectionId, score, band);
      // T10 — disparar animación visual en el LiveSectionScore (R14)
      animatingSectionId = sectionId;
      setTimeout(() => {
        if (animatingSectionId === sectionId) animatingSectionId = null;
      }, 800);
    }
  });

  const itemFieldTypes = new Map(
    data.sections.flatMap((s) => s.items.map((it) => [it.id, it.fieldType]))
  );

  function getFieldType(itemId: string): string {
    return itemFieldTypes.get(itemId) ?? 'text';
  }

  function persistDraftSnapshot() {
    void saveDraft(buildDraftPayload(data.auditId, itemLocalState));
  }

  async function syncDraftCleanup(outcome: string) {
    const result = await maybeDeleteDraftWhenSynced(
      data.auditId,
      outcome,
      listQueued,
      deleteDraft
    );
    retryQueue = await listQueued(data.auditId);
    return result;
  }

  onMount(async () => {
    pendingDraft = resolvePendingDraftOnMount(await loadDraft(data.auditId));
  });

  function handleRestore() {
    if (!pendingDraft) return;
    itemLocalState = restoreDraft({
      draft: pendingDraft,
      itemLocalState,
      getFieldType,
      scheduleSave: autosave.scheduleSave
    });
    pendingDraft = null;
  }

  async function handleDiscard() {
    await discardPendingDraft(data.auditId, deleteDraft);
    pendingDraft = null;
  }

  $effect(() => {
    const cleanup = registerOnlineFlush(data.auditId, autosave.patch, async () => {
      saveState = 'saved';
      const queued = await listQueued(data.auditId);
      retryQueue = queued;
      if (queued.length === 0) {
        void deleteDraft(data.auditId);
      }
    });
    void flushQueue(data.auditId, autosave.patch).then(async () => {
      const queued = await listQueued(data.auditId);
      retryQueue = queued;
      if (queued.length === 0) {
        void deleteDraft(data.auditId);
      }
    });
    // Cargar la cola de reintentos
    void (async () => {
      const queued = await listQueued(data.auditId);
      retryQueue = queued;
    })();
    return cleanup;
  });

  // Función para reintentar cuando el usuario hace click en el botón Reintentar del toast
  async function handleRetry() {
    saveState = 'saving';
    toastOpen = false;
    await flushQueue(data.auditId, autosave.patch);
    const queued = await listQueued(data.auditId);
    retryQueue = queued;
    if (queued.length === 0) {
      void deleteDraft(data.auditId);
    }
  }

  async function saveItem(
    itemId: string,
    fieldType: string,
    value: unknown,
    na = false,
    notes?: string | null
  ) {
    // T9 — Registrar qué ítem se está guardando (R1, R10)
    savingItemId = itemId;
    // T8 — Actualizar estado local inmediatamente para chip reactivo (R6)
    itemLocalState = new Map(itemLocalState).set(itemId, { value, na, notes: notes ?? null });
    persistDraftSnapshot();
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
    await syncDraftCleanup(outcome);
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

  // T11 — Ir al próximo pendiente (R8–R12)
  function goToNextPending() {
    const secs = data.sections.map((sec) => ({
      id: sec.id,
      items: sec.items.map((it) => ({
        id: it.id,
        ...(itemLocalState.get(it.id) ?? { value: it.value, na: it.na ?? false, notes: it.notes ?? null })
      }))
    }));
    const target = nextPending(secs, activeSectionIndex, lastVisitedItemIndex);
    if (!target) {
      noPendingMessage = true;
      setTimeout(() => (noPendingMessage = false), 2500);
      return;
    }
    if (target.sectionIndex !== activeSectionIndex) {
      activeSectionId = target.sectionId;
      lastVisitedItemIndex = -1;
    }
    lastVisitedItemIndex = target.itemIndex;
    setTimeout(() => {
      document.getElementById(`item-${target.itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
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
      sectionProgress={progressBySec}
      onselect={(id) => (activeSectionId = id)}
    />
  </aside>

  <div class="space-y-4">
    {#if form?.error}
      <p class="text-sm text-red-600" role="alert">{form.error}</p>
    {/if}
    {#if pendingDraft}
      <DraftRecoveryBanner
        savedAt={pendingDraft.savedAt}
        onrestore={handleRestore}
        ondiscard={() => void handleDiscard()}
      />
    {/if}
    {#if data.pendingProposalCount > 0}
      <div class="rounded-sys-app border border-sys-naranja/30 bg-sys-naranja/10 p-3 text-sm text-sys-naranja flex items-center justify-between gap-3">
        <span>
          <strong>{data.pendingProposalCount}</strong> sugerencia{data.pendingProposalCount !== 1 ? 's' : ''} de reunión pendiente{data.pendingProposalCount !== 1 ? 's' : ''} de revisión
        </span>
        <a href="/auditorias/{data.auditId}/reunion" class="shrink-0 font-medium underline hover:no-underline">
          Revisar →
        </a>
      </div>
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
      <LiveSectionScore score={activeScore.score} band={activeScore.band} animating={animatingSectionId === activeSection?.id} />
    </div>

    <ExportImportPanel onexport={() => void handleExport()} onimport={(f) => void handleImport(f)} />

    <!-- T11 — Botón "Próximo pendiente" (R8) -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="min-h-[var(--sys-touch-min)] rounded-sys-app border border-sys-electrico/30 bg-sys-electrico/5
               px-3 text-sm font-medium text-sys-electrico hover:bg-sys-electrico/10"
        onclick={goToNextPending}
        data-action="next-pending"
      >
        Próximo pendiente →
      </button>
      {#if noPendingMessage}
        <span class="text-sm text-emerald-700" role="status">Sin pendientes</span>
      {/if}
    </div>

    {#if activeSection?.code === 'CAB'}
      {#if data.cab.locked}
        <div class="rounded-sys-app border border-sys-medio/20 bg-sys-medio/5 p-3 text-sm text-sys-medio" role="status">
          El CAB ya fue confirmado por otro técnico. Lo ves en solo-lectura.
        </div>
      {:else if data.cab.confirmed}
        <div class="rounded-sys-app border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          CAB confirmado. Podés reeditarlo.
        </div>
      {:else if data.cab.canConfirm}
        <form method="POST" action="?/confirmCab" use:enhance class="pt-1">
          <SysButton type="submit" variant="secondary" class="w-full">
            Confirmar CAB
          </SysButton>
        </form>
      {/if}
    {/if}

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
          status={itemStatuses.get(item.id) ?? 'pendiente'}
          saveState={savingItemId === item.id ? saveState : 'idle'}
          onchange={(value) => void saveItem(item.id, item.fieldType, value, item.na, item.notes)}
          onnchange={(na) => void saveItem(item.id, item.fieldType, null, na, item.notes)}
          onnoteschange={(notes) => {
            itemLocalState = new Map(itemLocalState).set(item.id, {
              ...(itemLocalState.get(item.id) ?? { value: item.value, na: item.na ?? false }),
              notes
            });
            void saveItem(item.id, item.fieldType, item.value, item.na, notes);
          }}
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

<!-- Toast de error al guardar -->
<SaveErrorToast
  saveState={saveState}
  errorMessage={saveErrorMessage}
  onretry={handleRetry}
  onclose={() => (toastOpen = false)}
/>

<!-- Indicador de guardado pendiente -->
<QueuePendingIndicator {retryQueue} />
