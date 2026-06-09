<script lang="ts">
  let {
    id,
    label,
    helpText,
    attachmentIds = $bindable<string[]>([]),
    oncapture,
    ongallery
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    attachmentIds?: string[];
    oncapture?: () => void;
    ongallery?: () => void;
  } = $props();
</script>

<div class="space-y-2" data-field-type="file_ref">
  <div>
    <span class="block text-sm font-medium text-slate-800">{label}</span>
    {#if helpText}
      <p class="text-xs text-slate-500">{helpText}</p>
    {/if}
  </div>

  <div class="flex gap-2">
    <button
      type="button"
      id="{id}-capture"
      class="flex-1 min-h-[var(--sys-touch-min)] rounded-sys-app bg-sys-electrico text-sm font-medium text-white"
      onclick={() => oncapture?.()}
    >
      Tomar foto
    </button>
    <button
      type="button"
      id="{id}-gallery"
      class="flex-1 min-h-[var(--sys-touch-min)] rounded-[var(--sys-radius)] border border-slate-300 text-sm font-medium"
      onclick={() => ongallery?.()}
    >
      Galería
    </button>
  </div>

  {#if attachmentIds.length > 0}
    <p class="text-xs text-emerald-600">{attachmentIds.length} archivo(s) adjunto(s)</p>
  {/if}
</div>

<input type="file" accept="image/*" capture="environment" class="hidden" id="{id}-input-capture" />
<input type="file" accept="image/*" class="hidden" id="{id}-input-gallery" />
