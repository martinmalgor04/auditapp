<script lang="ts">
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import {
    EMPRESA_RELACIONES,
    EMPRESA_RELACION_LABELS,
    EMPRESA_ESTADOS,
    EMPRESA_ESTADO_LABELS,
    EMPRESA_RELACION_BADGE,
    EMPRESA_ESTADO_BADGE,
    EMPRESA_EVENTO_TIPOS_REGISTRABLES,
    EMPRESA_EVENTO_TIPO_LABELS
  } from '$lib/crm/empresa-view';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Estado editable de la ficha. Se inicializa con los datos cargados; el guardado hace POST al
  // endpoint y refresca con la empresa devuelta.
  let empresa = $state({ ...data.empresa });

  // Timeline de eventos (R20). Se refresca tras registrar un evento o cambiar el override.
  let eventos = $state([...data.eventos]);

  function fmtFecha(d: string | Date): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  }

  // Label de un estado que puede venir como string libre (from/to_status de un evento) o null.
  function estadoLabel(s: string | null): string {
    if (!s) return '—';
    return EMPRESA_ESTADO_LABELS[s as keyof typeof EMPRESA_ESTADO_LABELS] ?? s;
  }

  type Field = {
    key: keyof typeof empresa;
    label: string;
    type?: 'text' | 'number';
  };

  const maestros: Field[] = [
    { key: 'razonSocial', label: 'Razón social' },
    { key: 'cuit', label: 'CUIT' },
    { key: 'rubro', label: 'Rubro' },
    { key: 'empleados', label: 'Empleados', type: 'number' },
    { key: 'puestos', label: 'Puestos', type: 'number' },
    { key: 'sedes', label: 'Sedes', type: 'number' },
    { key: 'referenteNombre', label: 'Referente' },
    { key: 'referenteCargo', label: 'Cargo del referente' },
    { key: 'referenteContacto', label: 'Contacto del referente' },
    { key: 'erpActual', label: 'ERP actual' },
    { key: 'proveedorCorreo', label: 'Proveedor de correo' },
    { key: 'soporteItActual', label: 'Soporte IT actual' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'cp', label: 'CP' },
    { key: 'provincia', label: 'Provincia' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'nivelInteres', label: 'Nivel de interés' },
    { key: 'tieneSoftware', label: 'Tiene software' },
    { key: 'fuente', label: 'Fuente' }
  ];

  // Mapeo camelCase (UI) → snake_case (columna/endpoint).
  const TO_COLUMN: Record<string, string> = {
    razonSocial: 'razon_social',
    cuit: 'cuit',
    rubro: 'rubro',
    empleados: 'empleados',
    puestos: 'puestos',
    sedes: 'sedes',
    referenteNombre: 'referente_nombre',
    referenteCargo: 'referente_cargo',
    referenteContacto: 'referente_contacto',
    erpActual: 'erp_actual',
    proveedorCorreo: 'proveedor_correo',
    soporteItActual: 'soporte_it_actual',
    direccion: 'direccion',
    cp: 'cp',
    provincia: 'provincia',
    telefono: 'telefono',
    email: 'email',
    nivelInteres: 'nivel_interes',
    tieneSoftware: 'tiene_software',
    observaciones: 'observaciones',
    fuente: 'fuente',
    relacion: 'relacion'
  };

  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let saveOk = $state(false);

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    const intKeys = new Set(['empleados', 'puestos', 'sedes']);
    for (const [camel, column] of Object.entries(TO_COLUMN)) {
      const raw = (empresa as Record<string, unknown>)[camel];
      if (column === 'razon_social') {
        payload[column] = String(raw ?? '').trim();
        continue;
      }
      if (column === 'relacion') {
        payload[column] = raw;
        continue;
      }
      if (intKeys.has(column)) {
        if (raw === '' || raw === null || raw === undefined) {
          payload[column] = null;
        } else {
          payload[column] = Number(raw);
        }
        continue;
      }
      const str = raw === null || raw === undefined ? '' : String(raw);
      payload[column] = str.trim() === '' ? null : str.trim();
    }
    return payload;
  }

  async function save() {
    saving = true;
    saveError = null;
    saveOk = false;
    try {
      const res = await fetch(`/api/crm/empresas/${empresa.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        saveError = json.error ?? 'No se pudo guardar';
        return;
      }
      empresa = { ...json.data.empresa };
      saveOk = true;
    } catch {
      saveError = 'No se pudo guardar';
    } finally {
      saving = false;
    }
  }

  // ── Registrar evento/nota (R22) ──────────────────────────────────────────────────────────────
  let eventoTipo = $state<(typeof EMPRESA_EVENTO_TIPOS_REGISTRABLES)[number]>('nota');
  let eventoTexto = $state('');
  let eventoSaving = $state(false);
  let eventoError = $state<string | null>(null);

  async function registrarEvento() {
    if (!eventoTexto.trim()) {
      eventoError = 'El texto del evento es requerido';
      return;
    }
    eventoSaving = true;
    eventoError = null;
    try {
      const res = await fetch(`/api/crm/empresas/${empresa.id}/eventos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: eventoTipo, texto: eventoTexto.trim() })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        eventoError = json.error ?? 'No se pudo registrar el evento';
        return;
      }
      eventos = [json.data.evento, ...eventos];
      eventoTexto = '';
    } catch {
      eventoError = 'No se pudo registrar el evento';
    } finally {
      eventoSaving = false;
    }
  }

  // ── Override de estado (R15, R23) ────────────────────────────────────────────────────────────
  let overrideValue = $state<string>(data.empresa.estadoOverride ?? '');
  let overrideSaving = $state(false);
  let overrideError = $state<string | null>(null);

  async function applyOverride(estado: string | null) {
    overrideSaving = true;
    overrideError = null;
    try {
      const res = await fetch(`/api/crm/empresas/${empresa.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_override: estado })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        overrideError = json.error ?? 'No se pudo cambiar el estado';
        return;
      }
      empresa = { ...json.data.empresa };
      overrideValue = empresa.estadoOverride ?? '';
      // Refrescar el timeline: el override generó un evento `cambio_estado`.
      const evRes = await fetch(`/api/crm/empresas/${empresa.id}/eventos`);
      const evJson = await evRes.json();
      if (evRes.ok && evJson.success) {
        eventos = evJson.data.eventos;
      }
    } catch {
      overrideError = 'No se pudo cambiar el estado';
    } finally {
      overrideSaving = false;
    }
  }

  function saveOverride() {
    applyOverride(overrideValue || null);
  }

  function clearOverride() {
    applyOverride(null);
  }
</script>

<svelte:head>
  <title>{empresa.razonSocial} — CRM</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="space-y-1">
      <a href="/crm" class="text-sm font-medium text-sys-electrico hover:underline">← Volver al listado</a>
      <h1 class="text-2xl font-semibold text-sys-profundo" data-testid="ficha-razon-social">
        {empresa.razonSocial}
      </h1>
    </div>
    <div class="flex items-center gap-2">
      <span
        class="rounded-full px-3 py-1 text-sm font-medium {EMPRESA_RELACION_BADGE[empresa.relacion]}"
        data-testid="ficha-relacion-badge"
      >
        {EMPRESA_RELACION_LABELS[empresa.relacion]}
      </span>
      <a
        href={`/auditorias/new?empresaId=${empresa.id}`}
        class="rounded-sys bg-sys-electrico px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        data-testid="ficha-crear-auditoria"
      >
        Crear auditoría
      </a>
    </div>
  </div>

  <div
    class="space-y-3 rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
    data-testid="ficha-estado"
  >
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm text-sys-medio">Estado</span>
      <span
        class="rounded-full px-3 py-1 text-sm font-medium {EMPRESA_ESTADO_BADGE[empresa.estado]}"
        data-testid="ficha-estado-badge"
      >
        {EMPRESA_ESTADO_LABELS[empresa.estado]}
      </span>
      <span class="text-xs text-sys-medio" data-testid="ficha-estado-source">
        {empresa.estadoSource === 'override' ? 'Fijado manualmente' : 'Derivado automáticamente'}
      </span>
    </div>

    <div class="flex flex-wrap items-end gap-3 border-t border-sys-borde pt-3">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium text-sys-profundo">Override de estado</span>
        <select
          bind:value={overrideValue}
          class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
          data-testid="ficha-override-select"
        >
          <option value="">— Sin override (derivado) —</option>
          {#each EMPRESA_ESTADOS as e (e)}
            <option value={e}>{EMPRESA_ESTADO_LABELS[e]}</option>
          {/each}
        </select>
      </label>
      <SysButton
        type="button"
        variant="secondary"
        disabled={overrideSaving}
        onclick={saveOverride}
        data-testid="ficha-override-save"
      >
        {overrideSaving ? 'Guardando…' : 'Fijar estado'}
      </SysButton>
      {#if empresa.estadoSource === 'override'}
        <SysButton
          type="button"
          variant="ghost"
          disabled={overrideSaving}
          onclick={clearOverride}
          data-testid="ficha-override-clear"
        >
          Quitar override
        </SysButton>
      {/if}
    </div>
    {#if overrideError}
      <p class="text-sm text-red-600" data-testid="ficha-override-error">{overrideError}</p>
    {/if}
  </div>

  <form
    class="space-y-6 rounded-sys border border-sys-borde bg-white p-4 shadow-sm sm:p-6"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
    data-testid="ficha-form"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium text-sys-profundo">Relación</span>
        <select
          bind:value={empresa.relacion}
          class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
          data-testid="ficha-relacion"
        >
          {#each EMPRESA_RELACIONES as r (r)}
            <option value={r}>{EMPRESA_RELACION_LABELS[r]}</option>
          {/each}
        </select>
      </label>

      {#each maestros as field (field.key)}
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium text-sys-profundo">{field.label}</span>
          <input
            type={field.type ?? 'text'}
            bind:value={empresa[field.key]}
            class="sys-field w-full rounded-sys border border-sys-borde px-3 py-2 text-sm"
            data-testid="ficha-field-{TO_COLUMN[field.key as string]}"
          />
        </label>
      {/each}
    </div>

    <label class="flex flex-col gap-1 text-sm">
      <span class="font-medium text-sys-profundo">Observaciones</span>
      <textarea
        bind:value={empresa.observaciones}
        rows="3"
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="ficha-field-observaciones"
      ></textarea>
    </label>

    {#if saveError}
      <p class="text-sm text-red-600" data-testid="ficha-save-error">{saveError}</p>
    {/if}
    {#if saveOk}
      <p class="text-sm text-emerald-700" data-testid="ficha-save-ok">Cambios guardados.</p>
    {/if}

    <div class="flex items-center gap-3">
      <SysButton type="submit" variant="primary" disabled={saving} data-testid="ficha-save">
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </SysButton>
    </div>
  </form>

  <!-- Timeline + registro de eventos (R20, R22) -->
  <section
    class="space-y-4 rounded-sys border border-sys-borde bg-white p-4 shadow-sm sm:p-6"
    data-testid="ficha-timeline"
  >
    <h2 class="text-lg font-semibold text-sys-profundo">Actividad</h2>

    <form
      class="flex flex-col gap-3 sm:flex-row sm:items-end"
      onsubmit={(e) => {
        e.preventDefault();
        registrarEvento();
      }}
      data-testid="ficha-evento-form"
    >
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium text-sys-profundo">Tipo</span>
        <select
          bind:value={eventoTipo}
          class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
          data-testid="ficha-evento-tipo"
        >
          {#each EMPRESA_EVENTO_TIPOS_REGISTRABLES as t (t)}
            <option value={t}>{EMPRESA_EVENTO_TIPO_LABELS[t]}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-1 flex-col gap-1 text-sm">
        <span class="font-medium text-sys-profundo">Detalle</span>
        <input
          type="text"
          bind:value={eventoTexto}
          placeholder="Llamada de seguimiento, reunión, nota…"
          class="w-full rounded-sys border border-sys-borde px-3 py-2 text-sm"
          data-testid="ficha-evento-texto"
        />
      </label>
      <SysButton
        type="submit"
        variant="primary"
        disabled={eventoSaving}
        data-testid="ficha-evento-save"
      >
        {eventoSaving ? 'Registrando…' : 'Registrar'}
      </SysButton>
    </form>
    {#if eventoError}
      <p class="text-sm text-red-600" data-testid="ficha-evento-error">{eventoError}</p>
    {/if}

    {#if eventos.length === 0}
      <p class="text-sm text-sys-medio" data-testid="ficha-timeline-empty">Sin actividad registrada.</p>
    {:else}
      <ul class="space-y-3" data-testid="ficha-timeline-list">
        {#each eventos as ev (ev.id)}
          <li class="flex gap-3 border-l-2 border-sys-borde pl-3" data-testid="ficha-timeline-item">
            <div class="flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium text-sys-profundo">
                  {EMPRESA_EVENTO_TIPO_LABELS[ev.tipo] ?? ev.tipo}
                </span>
                <span class="text-xs text-sys-medio">{fmtFecha(ev.createdAt)}</span>
                {#if ev.createdByName}
                  <span class="text-xs text-sys-medio">· {ev.createdByName}</span>
                {/if}
              </div>
              {#if ev.tipo === 'cambio_estado'}
                <p class="text-sm text-sys-medio">
                  {estadoLabel(ev.fromStatus)}
                  →
                  {estadoLabel(ev.toStatus)}
                  {#if ev.texto}<span> · {ev.texto}</span>{/if}
                </p>
              {:else if ev.texto}
                <p class="text-sm text-sys-profundo">{ev.texto}</p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
