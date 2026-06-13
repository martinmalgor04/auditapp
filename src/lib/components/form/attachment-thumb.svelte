<script lang="ts">
  import { fetchAttachmentPreviewUrl } from '$lib/client/form/attachment-preview';

  let {
    attachmentId,
    onremove
  }: {
    attachmentId: string;
    onremove?: () => void | Promise<void>;
  } = $props();

  let url = $state<string | null>(null);
  let error = $state('');
  let loading = $state(true);
  let removing = $state(false);

  $effect(() => {
    const id = attachmentId;
    loading = true;
    error = '';
    url = null;

    void fetchAttachmentPreviewUrl(id).then((result) => {
      if (result.ok) {
        url = result.url;
      } else {
        error = result.error;
      }
      loading = false;
    });
  });

  async function handleRemove(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!onremove || removing) return;
    if (!confirm('¿Quitar esta foto?')) return;
    removing = true;
    try {
      await onremove();
    } finally {
      removing = false;
    }
  }
</script>

{#if loading}
  <div
    class="relative h-20 w-20 shrink-0 animate-pulse rounded border border-slate-200 bg-slate-100"
    aria-label="Cargando foto"
  ></div>
{:else if url}
  <div class="relative shrink-0">
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      class="block overflow-hidden rounded border border-emerald-200 ring-1 ring-emerald-100"
      title="Ver foto en tamaño completo"
    >
      <img src={url} alt="Foto adjunta" class="h-20 w-20 object-cover" loading="lazy" />
    </a>
    {#if onremove}
      <button
        type="button"
        class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold leading-none text-red-600 shadow-sm disabled:opacity-50"
        aria-label="Quitar foto"
        disabled={removing}
        onclick={handleRemove}
      >
        ×
      </button>
    {/if}
  </div>
{:else}
  <div class="relative shrink-0">
    <div
      class="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-red-200 bg-red-50 p-1 text-center text-[10px] leading-tight text-red-600"
      title={error}
    >
      No se pudo mostrar
    </div>
    {#if onremove}
      <button
        type="button"
        class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold leading-none text-red-600 shadow-sm disabled:opacity-50"
        aria-label="Quitar foto"
        disabled={removing}
        onclick={handleRemove}
      >
        ×
      </button>
    {/if}
  </div>
{/if}
