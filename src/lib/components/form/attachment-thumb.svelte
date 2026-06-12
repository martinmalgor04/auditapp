<script lang="ts">
  import { fetchAttachmentPreviewUrl } from '$lib/client/form/attachment-preview';

  let { attachmentId }: { attachmentId: string } = $props();

  let url = $state<string | null>(null);
  let error = $state('');
  let loading = $state(true);

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
</script>

{#if loading}
  <div
    class="h-20 w-20 shrink-0 animate-pulse rounded border border-slate-200 bg-slate-100"
    aria-label="Cargando foto"
  ></div>
{:else if url}
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    class="block shrink-0 overflow-hidden rounded border border-emerald-200 ring-1 ring-emerald-100"
    title="Ver foto en tamaño completo"
  >
    <img src={url} alt="Foto adjunta" class="h-20 w-20 object-cover" loading="lazy" />
  </a>
{:else}
  <div
    class="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-red-200 bg-red-50 p-1 text-center text-[10px] leading-tight text-red-600"
    title={error}
  >
    No se pudo mostrar
  </div>
{/if}
