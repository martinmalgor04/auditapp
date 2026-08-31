<script lang="ts">
  import type { app } from '../../wailsjs/go/models';

  let { aviso }: { aviso: app.AvisoVersionDTO } = $props();
</script>

<div class="flex items-center justify-between gap-3 bg-sys-electrico px-4 py-2 text-sm text-white">
  <span>Hay una versión nueva del agente: <strong>{aviso.versionNueva}</strong>. Descargala cuando puedas.</span>
  <a
    href={aviso.url}
    target="_blank"
    rel="noreferrer"
    class="rounded-sys bg-white px-3 py-1 font-semibold text-sys-profundo hover:bg-sys-offwhite"
  >
    Descargar
  </a>
</div>
