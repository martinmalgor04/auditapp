<script lang="ts">
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import { formatDateTime } from '$lib/utils/format';

  // R6: el token en claro se muestra una única vez (en la respuesta del action)
  let { token, expiresAt }: { token: string; expiresAt: string } = $props();

  let copied = $state(false);

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // fallback silencioso (mismo patrón que CopyLinkButton)
    }
  }
</script>

<div
  class="space-y-3 rounded-sys border border-sys-naranja/30 bg-sys-naranja/10 p-4"
  data-testid="escaneo-token-panel"
>
  <p class="text-sm font-semibold text-sys-profundo">
    Token emitido — se muestra una única vez
  </p>
  <p class="text-xs text-sys-medio">
    Copialo ahora y pegalo en la configuración del agente. Al recargar la página no vas a poder
    verlo de nuevo: solo queda registrado su hash.
  </p>
  <div class="flex flex-wrap items-center gap-2">
    <code
      class="flex-1 break-all rounded-sys border border-sys-borde bg-white px-3 py-2 font-mono text-xs text-sys-profundo"
      data-testid="escaneo-token-value"
    >
      {token}
    </code>
    <SysButton variant="secondary" data-testid="escaneo-token-copy" onclick={copyToken}>
      {copied ? 'Copiado' : 'Copiar token'}
    </SysButton>
  </div>
  <p class="text-xs text-sys-medio">
    Vence: <span class="font-medium tabular-nums">{formatDateTime(expiresAt)}</span>
  </p>
</div>
