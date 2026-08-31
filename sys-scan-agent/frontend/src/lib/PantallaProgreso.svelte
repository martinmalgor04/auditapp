<script lang="ts">
  import { CancelarEscaneo, ReintentarCola } from '../../wailsjs/go/main/App';
  import type { scan } from '../../wailsjs/go/models';

  let { progreso, onTerminado }: {
    progreso: scan.ScanProgreso;
    onTerminado: (p: scan.ScanProgreso) => void;
  } = $props();

  let cancelando = $state(false);

  const fases: Record<string, string> = {
    validar_token: 'Validando el token',
    consentimiento: 'Registrando el consentimiento',
    en_curso: 'Iniciando el escaneo',
    barrido_arp_host: 'Buscando equipos en la red (ARP)',
    levantar_contenedor: 'Preparando el motor de escaneo',
    configurar_discovery: 'Configurando el discovery',
    monitorear: 'Escaneando la red (puede tardar)',
    recolectar_y_normalizar: 'Procesando los equipos encontrados',
    sincronizando: 'Sincronizando con AuditApp',
    drenar_cola: 'Terminando de sincronizar',
    completado: 'Escaneo completado',
    fallido: 'El escaneo falló',
    cancelado: 'Escaneo cancelado'
  };

  const esFinal = $derived(
    progreso.Fase === 'completado' || progreso.Fase === 'fallido' || progreso.Fase === 'cancelado'
  );

  $effect(() => {
    if (esFinal) {
      onTerminado(progreso);
    }
  });

  async function cancelar() {
    cancelando = true;
    try {
      await CancelarEscaneo();
    } finally {
      cancelando = false;
    }
  }
</script>

<section class="mx-auto flex max-w-lg flex-col gap-4 p-6">
  <header>
    <h2 class="text-xl font-semibold text-sys-profundo">Escaneando {progreso.Empresa}</h2>
    <p class="text-sm text-sys-neutro">{progreso.Auditoria}{progreso.Etiqueta ? ` — ${progreso.Etiqueta}` : ''}</p>
    <p class="font-mono text-xs text-sys-neutro">{progreso.Rango}</p>
  </header>

  {#if progreso.ModoDegradado}
    <!-- R7: advertencia persistente hasta el cierre del escaneo -->
    <div class="rounded-sys-app border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="aviso-degradado">
      ⚠ {progreso.Advertencia}
    </div>
  {/if}

  <div class="sys-card flex flex-col gap-3 p-4">
    <p class="text-sm font-medium text-sys-profundo">{fases[progreso.Fase] ?? progreso.Fase}</p>

    {#if progreso.PullPorcentaje > 0 && progreso.PullPorcentaje < 100 && progreso.Fase === 'levantar_contenedor'}
      <div>
        <div class="h-2 w-full rounded-full bg-sys-offwhite">
          <div class="h-2 rounded-full bg-sys-electrico" style="width: {progreso.PullPorcentaje}%"></div>
        </div>
        <p class="mt-1 text-xs text-sys-neutro">
          Descargando el motor de escaneo (solo la primera vez): {progreso.PullPorcentaje}%
        </p>
      </div>
    {/if}

    <dl class="grid grid-cols-2 gap-2 text-center">
      <div class="rounded-sys bg-sys-offwhite p-3">
        <dt class="text-xs text-sys-neutro">Equipos encontrados</dt>
        <dd class="text-2xl font-semibold text-sys-profundo" data-testid="encontrados">{progreso.Encontrados}</dd>
      </div>
      <div class="rounded-sys bg-sys-offwhite p-3">
        <dt class="text-xs text-sys-neutro">Sincronizados</dt>
        <dd class="text-2xl font-semibold text-sys-verde" data-testid="sincronizados">{progreso.Sincronizados}</dd>
      </div>
    </dl>

    {#if progreso.ColaPausada}
      <div class="rounded-sys border border-amber-300 bg-amber-50 p-3 text-sm">
        <p class="font-medium">Sin internet hace rato. Los datos están guardados acá, no se pierden.</p>
        <button class="sys-btn-secondary mt-2" onclick={() => ReintentarCola()} data-testid="btn-reintentar-cola">
          Reintentar ahora
        </button>
      </div>
    {/if}

    {#if progreso.Error}
      <p class="rounded-sys bg-red-50 p-3 text-sm text-sys-rojo" data-testid="error-escaneo">{progreso.Error}</p>
    {/if}
  </div>

  {#if !esFinal}
    <button class="sys-btn-secondary self-center" onclick={cancelar} disabled={cancelando} data-testid="btn-cancelar">
      {cancelando ? 'Cancelando…' : 'Cancelar el escaneo'}
    </button>
    <p class="text-center text-xs text-sys-neutro">
      Si cancelás, se limpian las credenciales y el contenedor igual.
    </p>
  {/if}
</section>
