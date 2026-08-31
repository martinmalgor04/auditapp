<script lang="ts">
  import { ValidarToken } from '../../wailsjs/go/main/App';
  import type { app } from '../../wailsjs/go/models';

  let { onValido }: { onValido: (info: app.EscaneoInfoDTO) => void } = $props();

  let token = $state('');
  let validando = $state(false);
  let error = $state('');
  let info = $state<app.EscaneoInfoDTO | null>(null);

  async function validar() {
    validando = true;
    error = '';
    info = null;
    try {
      info = await ValidarToken(token);
    } catch (e) {
      error = String(e);
    } finally {
      validando = false;
    }
  }
</script>

<section class="mx-auto flex max-w-lg flex-col gap-4 p-6">
  <header>
    <h2 class="text-xl font-semibold text-sys-profundo">Nuevo escaneo</h2>
    <p class="mt-1 text-sm text-sys-neutro">
      Pegá el token del escaneo que te muestra AuditApp (tiene la forma
      <code class="rounded bg-sys-offwhite px-1">id-del-escaneo:token</code>).
    </p>
  </header>

  <textarea
    class="sys-field min-h-20 font-mono text-xs"
    placeholder="Pegá acá el token del escaneo"
    bind:value={token}
    data-testid="input-token"
  ></textarea>

  {#if error}
    <p class="rounded-sys bg-red-50 p-3 text-sm text-sys-rojo" data-testid="error-token">{error}</p>
  {/if}

  <button class="sys-btn-primary" onclick={validar} disabled={validando || !token.trim()} data-testid="btn-validar">
    {validando ? 'Validando…' : 'Validar token'}
  </button>

  {#if info}
    <div class="sys-card p-4" data-testid="confirmacion-escaneo">
      <h3 class="text-sm font-semibold text-sys-profundo">¿Es este el escaneo?</h3>
      <dl class="mt-2 grid grid-cols-3 gap-2 text-sm">
        <dt class="text-sys-neutro">Empresa</dt>
        <dd class="col-span-2 font-medium">{info.empresa}</dd>
        <dt class="text-sys-neutro">Auditoría</dt>
        <dd class="col-span-2">{info.auditoria}</dd>
        {#if info.etiqueta}
          <dt class="text-sys-neutro">Etiqueta</dt>
          <dd class="col-span-2">{info.etiqueta}</dd>
        {/if}
        <dt class="text-sys-neutro">Rango</dt>
        <dd class="col-span-2 font-mono">{info.rango}</dd>
        <dt class="text-sys-neutro">Estado</dt>
        <dd class="col-span-2">{info.estado}</dd>
      </dl>
      <button class="sys-btn-primary mt-4 w-full" onclick={() => info && onValido(info)} data-testid="btn-confirmar">
        Sí, continuar
      </button>
    </div>
  {/if}
</section>
