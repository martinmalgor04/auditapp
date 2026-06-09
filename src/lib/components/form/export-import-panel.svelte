<script lang="ts">
  let {
    onexport,
    onimport
  }: {
    onexport?: () => void;
    onimport?: (file: File) => void;
  } = $props();

  let fileInput: HTMLInputElement | undefined = $state();

  function handleFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onimport?.(file);
    input.value = '';
  }
</script>

<div class="flex gap-2">
  <button
    type="button"
    class="min-h-[var(--sys-touch-min)] rounded border border-slate-300 px-3 text-sm"
    onclick={() => onexport?.()}
  >
    Exportar JSON
  </button>
  <button
    type="button"
    class="min-h-[var(--sys-touch-min)] rounded border border-slate-300 px-3 text-sm"
    onclick={() => fileInput?.click()}
  >
    Importar JSON
  </button>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    class="hidden"
    onchange={handleFile}
  />
</div>
