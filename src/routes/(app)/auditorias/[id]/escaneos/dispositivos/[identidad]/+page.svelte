<script lang="ts">
  import RevisionBadge from '$lib/components/escaneos/revision-badge.svelte';
  import EscaneoEstadoBadge from '$lib/components/escaneos/escaneo-estado-badge.svelte';
  import RawJsonDetails from '$lib/components/escaneos/raw-json-details.svelte';
  import FusionarPanel from '$lib/components/escaneos/fusionar-panel.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import { DISPOSITIVO_TIPO_LABELS, formatMac } from '$lib/escaneos/escaneo-view';
  import { formatDateTime } from '$lib/utils/format';
  import type { PageData } from './$types';

  let { data, form }: { data: PageData; form?: Record<string, unknown> } = $props();

  let fusionarAbierto = $state(false);

  const d = $derived(data.dispositivo);
  // R18: la ocurrencia canónica (rn = 1) es la primera de la provenance
  const origenCanonico = $derived(d.ocurrencias[0] ?? null);

  const campos = $derived(
    [
      ['IP', d.ip],
      ['MAC', d.mac ? formatMac(d.mac) : null],
      ['Hostname', d.hostname],
      ['FQDN', d.fqdn],
      ['Fabricante', d.fabricante],
      ['Modelo', d.modelo],
      ['Serial', d.serial],
      ['Tipo', DISPOSITIVO_TIPO_LABELS[d.tipo]],
      ['Sistema operativo', [d.soFamilia, d.soNombre, d.soVersion].filter(Boolean).join(' · ') || null],
      ['CPU', d.cpuDescripcion],
      ['Memoria', d.memoriaMb !== null ? `${d.memoriaMb} MB` : null],
      ['Disco', d.discoTotalGb !== null ? `${d.discoTotalGb} GB` : null],
      ['Última detección', d.vistoAt ? formatDateTime(d.vistoAt) : null]
    ] as [string, string | null][]
  );
</script>

<svelte:head>
  <title>{d.hostname ?? d.identidad} — Escaneos de red</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="space-y-1">
      <a
        href="/auditorias/{data.audit.id}/escaneos"
        class="text-sm font-medium text-sys-electrico hover:underline"
      >
        ← Escaneos de red
      </a>
      <h1 class="text-2xl font-semibold text-sys-profundo" data-testid="detalle-titulo">
        {d.hostname ?? d.identidad}
      </h1>
      <p class="text-sm text-sys-medio">
        {data.audit.razonSocial} · <span class="font-mono">{data.audit.refCode}</span>
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded-full bg-sys-offwhite px-2 py-0.5 text-xs font-medium text-sys-text-secondary">
        {DISPOSITIVO_TIPO_LABELS[d.tipo]}
      </span>
      <RevisionBadge revision={d.revision} />
      {#if d.identidadPorIp}
        <span
          class="rounded-full bg-[rgba(245,158,11,.12)] px-2 py-0.5 text-xs font-medium text-sys-status-amber"
          title="Identidad derivada de IP: puede cambiar por reasignación DHCP"
          data-testid="identidad-debil-badge"
        >
          Identidad débil
        </span>
      {/if}
    </div>
  </div>

  {#if typeof form?.error === 'string'}
    <p class="rounded-sys border border-sys-rojo/20 bg-sys-rojo/10 p-3 text-sm text-sys-rojo" role="alert">
      {form.error}
    </p>
  {:else if form?.success}
    <p class="rounded-sys border border-sys-verde/20 bg-sys-verde/10 p-3 text-sm text-sys-verde" role="status">
      Revisión aplicada.
    </p>
  {/if}

  <!-- R13: revisión efectiva con quién y cuándo -->
  {#if d.revision !== 'sin_revisar'}
    <p class="text-sm text-sys-medio" data-testid="revision-meta">
      {data.revisadoPorNombre ?? 'Usuario'} · {formatDateTime(d.revisadoAt)}
      {#if d.notaTecnico}
        <span class="block text-xs text-sys-text-faint">Nota: {d.notaTecnico}</span>
      {/if}
    </p>
  {/if}

  <!-- Vínculo con el relevamiento manual (R21/R25) -->
  {#if d.revision === 'fusionado'}
    <section class="space-y-2 rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="vinculo-bloque">
      <h2 class="text-sm font-semibold text-sys-profundo">Vínculo con relevamiento manual</h2>
      {#if d.vinculo && d.vinculo.vivo}
        <p class="text-sm text-sys-medio">
          {d.vinculo.itemLabel}
          <span class="block text-xs text-sys-text-faint">{d.vinculo.resumenFila}</span>
        </p>
      {:else}
        <!-- R25: la fila manual fue eliminada → vínculo roto, sin modificar datos -->
        <p class="rounded-sys border border-sys-naranja/20 bg-sys-naranja/10 p-3 text-sm text-sys-medio" data-testid="vinculo-roto">
          La fila vinculada ya no existe en el relevamiento manual
          {#if d.vinculo}({d.vinculo.itemLabel}){/if}. Podés re-vincular a otra fila o desvincular.
        </p>
      {/if}
      <div class="flex flex-wrap gap-2">
        <SysButton variant="secondary" data-testid="revincular" onclick={() => (fusionarAbierto = true)}>
          Re-vincular
        </SysButton>
        <form
          method="POST"
          action="?/desvincular"
          onsubmit={(e) => !confirm('¿Desvincular? El dispositivo vuelve a Sin revisar.') && e.preventDefault()}
        >
          <SysButton type="submit" variant="ghost" data-testid="desvincular">Desvincular</SysButton>
        </form>
      </div>
    </section>
  {/if}

  <!-- Datos consolidados (R11/R18) -->
  <section class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm">
    <h2 class="mb-3 text-sm font-semibold text-sys-profundo">Datos consolidados</h2>
    <dl class="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2" data-testid="detalle-campos">
      {#each campos as [label, valor] (label)}
        <div class="flex justify-between gap-3 text-sm">
          <dt class="text-sys-medio">{label}</dt>
          <dd class="text-right font-medium break-all text-sys-profundo">{valor ?? '—'}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <!-- Acciones de revisión (R20/R21/R26; operan también con auditoría cerrada, R4) -->
  <section class="space-y-3 rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="revision-acciones">
    <h2 class="text-sm font-semibold text-sys-profundo">Revisión</h2>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <form method="POST" action="?/confirmar" class="flex flex-col gap-2 rounded-sys border border-sys-borde p-3">
        <textarea
          name="nota"
          rows="2"
          class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
          placeholder="Nota opcional (queda registrada)"
          data-testid="nota-confirmar"
        ></textarea>
        <div>
          <SysButton type="submit" variant="primary" disabled={d.revision === 'confirmado'} data-testid="accion-confirmar">
            Confirmar
          </SysButton>
        </div>
      </form>
      <form
        method="POST"
        action="?/descartar"
        class="flex flex-col gap-2 rounded-sys border border-sys-borde p-3"
        onsubmit={(e) => !confirm('¿Descartar este dispositivo?') && e.preventDefault()}
      >
        <textarea
          name="nota"
          rows="2"
          class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
          placeholder="Nota opcional (queda registrada)"
          data-testid="nota-descartar"
        ></textarea>
        <div>
          <SysButton type="submit" variant="secondary" disabled={d.revision === 'descartado'} data-testid="accion-descartar">
            Descartar
          </SysButton>
        </div>
      </form>
    </div>
    <div class="flex flex-wrap gap-2">
      <SysButton variant="secondary" data-testid="accion-fusionar" onclick={() => (fusionarAbierto = true)}>
        Fusionar con relevamiento
      </SysButton>
      {#if d.revision !== 'sin_revisar'}
        <form method="POST" action="?/volverASinRevisar">
          <SysButton type="submit" variant="ghost" data-testid="accion-sin-revisar">
            Volver a sin revisar
          </SysButton>
        </form>
      {/if}
    </div>
  </section>

  <!-- R18: software y servicios de la ocurrencia canónica, con origen identificado -->
  <section class="space-y-3 rounded-sys border border-sys-borde bg-white p-4 shadow-sm">
    <h2 class="text-sm font-semibold text-sys-profundo">Software y servicios de red</h2>
    {#if origenCanonico}
      <p class="text-xs text-sys-text-faint" data-testid="origen-canonico">
        Detectado por: {origenCanonico.escaneoEtiqueta ?? origenCanonico.escaneoRango} · {formatDateTime(origenCanonico.vistoAt)}
      </p>
    {/if}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <h3 class="mb-1 text-xs font-medium text-sys-medio">Software ({d.software.length})</h3>
        <ul class="space-y-1 text-sm" data-testid="detalle-software">
          {#each d.software as s (s.nombre + (s.version ?? ''))}
            <li class="text-sys-profundo">
              {s.nombre}
              <span class="text-xs text-sys-text-faint">
                {[s.version, s.publisher].filter(Boolean).join(' · ')}
              </span>
            </li>
          {:else}
            <li class="text-sm text-sys-text-faint">Sin software detectado</li>
          {/each}
        </ul>
      </div>
      <div>
        <h3 class="mb-1 text-xs font-medium text-sys-medio">Servicios ({d.servicios.length})</h3>
        <ul class="space-y-1 text-sm" data-testid="detalle-servicios">
          {#each d.servicios as s (s.puerto + s.protocolo)}
            <li class="text-sys-profundo">
              <span class="font-mono text-xs">{s.puerto}/{s.protocolo}</span>
              {s.servicio ?? ''}
              <span class="text-xs text-sys-text-faint">
                {[s.producto, s.version].filter(Boolean).join(' · ')}
              </span>
              <span class="text-xs text-sys-text-faint">({s.estadoPuerto})</span>
            </li>
          {:else}
            <li class="text-sm text-sys-text-faint">Sin servicios detectados</li>
          {/each}
        </ul>
      </div>
    </div>
  </section>

  <!-- R10: provenance completa + R19: raw por ocurrencia -->
  <section class="space-y-3">
    <h2 class="text-sm font-semibold text-sys-profundo">Provenance ({d.ocurrencias.length} ocurrencias)</h2>
    <ul class="space-y-1" data-testid="provenance-lista">
      {#each d.ocurrencias as o (o.dispositivoId)}
        <li class="flex flex-wrap items-center gap-2 text-sm text-sys-medio">
          <EscaneoEstadoBadge estado={o.escaneoEstado} />
          <span>{o.escaneoEtiqueta ?? o.escaneoRango}</span>
          <span class="text-xs tabular-nums text-sys-text-faint">{formatDateTime(o.vistoAt)}</span>
        </li>
      {/each}
    </ul>
    <RawJsonDetails ocurrencias={d.ocurrenciasRaw} />
  </section>
</div>

{#if fusionarAbierto}
  <FusionarPanel filas={data.filasInventario} onClose={() => (fusionarAbierto = false)} />
{/if}
