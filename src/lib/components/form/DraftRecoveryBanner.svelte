<script lang="ts">
  import { formatDraftSavedAtLocal } from '$lib/client/form/draft-recovery';

  interface Props {
    savedAt: string;
    onrestore: () => void;
    ondiscard: () => void;
  }

  let { savedAt, onrestore, ondiscard }: Props = $props();

  const formattedAt = $derived(formatDraftSavedAtLocal(savedAt));
</script>

<div
  class="rounded-sys-app border border-sys-electrico/30 bg-sys-electrico/5 p-4 text-sm text-sys-profundo"
  role="alert"
  data-banner="draft-recovery"
>
  <p class="font-medium">Hay un borrador local sin sincronizar</p>
  <p class="mt-1 text-sys-medio">Guardado el {formattedAt}</p>
  <div class="mt-3 flex flex-wrap gap-2">
    <button
      type="button"
      class="min-h-[var(--sys-touch-min)] rounded-sys-app bg-sys-electrico px-3 text-sm font-medium text-white hover:bg-sys-electrico/90"
      onclick={onrestore}
      data-action="restore-draft"
    >
      Restaurar borrador
    </button>
    <button
      type="button"
      class="min-h-[var(--sys-touch-min)] rounded-sys-app border border-sys-medio/30 bg-white px-3 text-sm font-medium text-sys-profundo hover:bg-sys-offwhite"
      onclick={ondiscard}
      data-action="discard-draft"
    >
      Descartar
    </button>
  </div>
</div>
