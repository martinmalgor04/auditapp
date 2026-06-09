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
  import { enqueueSave, flushQueue, listQueued, registerOnlineFlush } from '$lib/client/form/retry-queue';
  import type { PageData } from './$types';

  let { data, form }: { data: PageData; form?: { error?: string; warnings?: Array<{ label: string }> } } =
    $props();

  let activeSectionId = $state(data.sections[0]?.id ?? '');
  let saveState = $state<SaveIndicatorState>('idle');
  let sectionScores = $state(
    new Map(data.sections.map((s) => [s.id, { sectionId: s.id, score: s.liveScore, band: s.scoreBand }]))
  );

  const activeSection = $derived(data.sections.find((s) => s.id === activeSectionId) ?? data.sections[0]);

  const autosave = createAutosave(data.auditId, {
    onStateChange: (s) => {
      saveState = s;
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
    const ok = await autosave.patch(payload);
    if (!ok) {
      await enqueueSave({
        auditId: data.auditId,
        ...payload,
        enqueuedAt: new Date().toISOString(),
        attempts: 0
      });
      saveState = 'offline';
    }
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

  async function uploadPhoto(itemId: string, sectionCode: string, file: File, rowId?: string) {
    const prepared = await prepareImageForUpload(file);
    const presignRes = await fetch(`/api/audits/${data.auditId}/attachments/presign-put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        section_code: sectionCode,
        filename: prepared.filename,
        content_type: prepared.contentType,
        size_bytes: prepared.sizeBytes,
        kind: 'photo'
      })
    });
    if (!presignRes.ok) return;
    const presignBody = await presignRes.json();
    const uploadUrl = presignBody.data.upload_url as string;
    const r2Key = presignBody.data.r2_key as string;

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': prepared.contentType, ...(presignBody.data.headers ?? {}) },
      body: prepared.blob
    });

    const confirmRes = await fetch(`/api/audits/${data.auditId}/attachments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        r2_key: r2Key,
        filename: prepared.filename,
        content_type: prepared.contentType,
        size_bytes: prepared.sizeBytes,
        kind: 'photo'
      })
    });
    if (!confirmRes.ok) return;
    const confirmBody = await confirmRes.json();
    const attachmentId = confirmBody.data.attachment_id as string;

    if (rowId) {
      const item = activeSection?.items.find((i) => i.id === itemId);
      const current = (item?.value ?? { rows: [] }) as { rows: Array<{ row_id: string; cells: Record<string, unknown>; attachment_ids: string[] }> };
      const rows = (current.rows ?? []).map((r) =>
        r.row_id === rowId
          ? { ...r, attachment_ids: [...(r.attachment_ids ?? []), attachmentId] }
          : r
      );
      await saveItem(itemId, 'table', { rows }, false);
    } else {
      await invalidateAll();
    }
  }

  function pickPhoto(itemId: string, sectionCode: string, rowId?: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void uploadPhoto(itemId, sectionCode, file, rowId);
    };
    input.click();
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
  <SaveIndicator state={saveState} />
</div>

<div class="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
  <aside class="mb-4 lg:mb-0 lg:sticky lg:top-16 lg:self-start">
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
          oncamera={(rowId) => pickPhoto(item.id, activeSection?.code ?? '', rowId)}
          onphotocapture={() => pickPhoto(item.id, activeSection?.code ?? '')}
          onphotogallery={() => pickPhoto(item.id, activeSection?.code ?? '')}
        />
      {/each}
    </div>

    <form method="POST" action="?/complete" use:enhance class="sticky bottom-4 pt-4">
      <SysButton type="submit" variant="primary" class="w-full shadow-md">
        Relevamiento completo
      </SysButton>
    </form>
  </div>
</div>
