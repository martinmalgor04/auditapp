<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ChequearActualizacion,
    EstadoDocker,
    IniciarEscaneo,
    Progreso,
    EscaneosReanudables,
    DescartarReanudacion,
    Version
  } from '../wailsjs/go/main/App';
  import type { app, scan } from '../wailsjs/go/models';
  import BannerActualizacion from './lib/BannerActualizacion.svelte';
  import AvisoDocker from './lib/AvisoDocker.svelte';
  import PantallaToken from './lib/PantallaToken.svelte';
  import PantallaCredenciales from './lib/PantallaCredenciales.svelte';
  import PantallaConsentimiento from './lib/PantallaConsentimiento.svelte';
  import PantallaProgreso from './lib/PantallaProgreso.svelte';
  import PantallaFinal from './lib/PantallaFinal.svelte';

  type Pantalla = 'token' | 'credenciales' | 'consentimiento' | 'progreso' | 'final';

  let pantalla = $state<Pantalla>('token');
  let version = $state('');
  let avisoVersion = $state<app.AvisoVersionDTO | null>(null);
  let dockerCaido = $state(false);
  let info = $state<app.EscaneoInfoDTO | null>(null);
  let credenciales = $state<app.CredencialDTO[]>([]);
  let progreso = $state<scan.ScanProgreso | null>(null);
  let reanudables = $state<string[]>([]);
  let errorInicio = $state('');

  onMount(async () => {
    version = await Version();
    // R29: aviso de nueva versión (best-effort, nunca rompe el arranque)
    try {
      avisoVersion = await ChequearActualizacion();
    } catch {
      avisoVersion = null;
    }
    // R3: Docker operativo al arrancar
    try {
      await EstadoDocker();
    } catch {
      dockerCaido = true;
    }
    // R18/R32: escaneos interrumpidos de una ejecución anterior
    try {
      reanudables = (await EscaneosReanudables()) ?? [];
    } catch {
      reanudables = [];
    }
  });

  // Polling de progreso mientras corre el escaneo (R16)
  $effect(() => {
    if (pantalla !== 'progreso') return;
    const intervalo = setInterval(async () => {
      try {
        progreso = await Progreso();
      } catch {
        // un poll fallido no interrumpe la UI
      }
    }, 1000);
    return () => clearInterval(intervalo);
  });

  function tokenValido(i: app.EscaneoInfoDTO) {
    info = i;
    pantalla = 'credenciales';
  }

  function credencialesListas(c: app.CredencialDTO[]) {
    credenciales = c;
    // R14: consentimiento solo si no estaba registrado
    if (info?.consentimientoOtorgado) {
      iniciar('');
    } else {
      pantalla = 'consentimiento';
    }
  }

  async function iniciar(consentimientoPor: string) {
    errorInicio = '';
    try {
      await IniciarEscaneo(credenciales, consentimientoPor);
      progreso = await Progreso();
      pantalla = 'progreso';
    } catch (e) {
      errorInicio = String(e);
      pantalla = 'token';
    }
  }

  function escaneoTerminado(p: scan.ScanProgreso) {
    progreso = p;
    pantalla = 'final';
  }

  function nuevoEscaneo() {
    info = null;
    credenciales = [];
    progreso = null;
    errorInicio = '';
    pantalla = 'token';
  }
</script>

<div class="flex min-h-screen flex-col bg-sys-offwhite">
  <header class="flex items-center justify-between bg-sys-profundo px-5 py-3 text-white">
    <div class="flex items-center gap-2">
      <span class="text-lg font-bold tracking-tight">SyS Scan</span>
      <span class="text-xs text-sys-celeste">Agente de escaneo de red</span>
    </div>
    <span class="text-xs text-sys-celeste">v{version || '…'}</span>
  </header>

  {#if avisoVersion}
    <BannerActualizacion aviso={avisoVersion} />
  {/if}

  {#if dockerCaido}
    <AvisoDocker onListo={() => (dockerCaido = false)} />
  {/if}

  {#if reanudables.length > 0 && pantalla === 'token'}
    <div class="mx-4 mt-4 rounded-sys-app border border-amber-300 bg-amber-50 p-4 text-sm">
      <p class="font-semibold text-sys-profundo">Hay un escaneo interrumpido</p>
      <p class="mt-1 text-sys-neutro">
        La última vez el agente se cerró a mitad de un escaneo. Los datos que quedaron sin enviar se
        retoman solos cuando inicies el escaneo de nuevo con su token.
      </p>
      <button
        class="mt-2 text-sys-rojo hover:underline"
        onclick={async () => {
          for (const id of reanudables) await DescartarReanudacion(id);
          reanudables = [];
        }}
      >
        Descartar el estado anterior
      </button>
    </div>
  {/if}

  {#if errorInicio}
    <p class="mx-4 mt-4 rounded-sys bg-red-50 p-3 text-sm text-sys-rojo">{errorInicio}</p>
  {/if}

  <main class="flex flex-1 flex-col">
    {#if pantalla === 'token'}
      <PantallaToken onValido={tokenValido} />
    {:else if pantalla === 'credenciales'}
      <PantallaCredenciales onContinuar={credencialesListas} onVolver={() => (pantalla = 'token')} />
    {:else if pantalla === 'consentimiento'}
      <PantallaConsentimiento onConfirmar={iniciar} onVolver={() => (pantalla = 'credenciales')} />
    {:else if pantalla === 'progreso' && progreso}
      <PantallaProgreso {progreso} onTerminado={escaneoTerminado} />
    {:else if pantalla === 'final' && progreso}
      <PantallaFinal {progreso} onNuevo={nuevoEscaneo} />
    {/if}
  </main>

  <footer class="px-5 py-3 text-center text-xs text-sys-neutro">
    Servicios y Sistemas — Las credenciales del cliente se borran al terminar cada escaneo.
  </footer>
</div>
