<script lang="ts">
  import type { app } from '../../wailsjs/go/models';

  let { onContinuar, onVolver }: {
    onContinuar: (creds: app.CredencialDTO[]) => void;
    onVolver: () => void;
  } = $props();

  type CredForm = {
    nombre: string;
    tipo: string;
    usuario: string;
    password: string;
    community: string;
    authProtocol: string;
    authPassphrase: string;
    privProtocol: string;
    privPassphrase: string;
  };

  const vacia: CredForm = {
    nombre: '', tipo: 'windows', usuario: '', password: '', community: '',
    authProtocol: 'SHA', authPassphrase: '', privProtocol: 'AES', privPassphrase: ''
  };

  let credenciales = $state<CredForm[]>([]);
  let actual = $state<CredForm>({ ...vacia });
  let error = $state('');

  const tipos = [
    { valor: 'windows', etiqueta: 'Windows (WMI / dominio)' },
    { valor: 'ssh', etiqueta: 'Linux (SSH)' },
    { valor: 'snmp', etiqueta: 'SNMP v1/v2c (community)' },
    { valor: 'snmp_v3', etiqueta: 'SNMP v3' }
  ];

  function agregar() {
    error = '';
    if (!actual.nombre.trim()) {
      error = 'Ponele un nombre a la credencial (ej: «dominio Windows»).';
      return;
    }
    if ((actual.tipo === 'windows' || actual.tipo === 'ssh') && (!actual.usuario || !actual.password)) {
      error = 'Falta usuario o contraseña.';
      return;
    }
    if (actual.tipo === 'snmp' && !actual.community) {
      error = 'Falta la community de SNMP.';
      return;
    }
    if (actual.tipo === 'snmp_v3' && !actual.usuario) {
      error = 'Falta el usuario de SNMP v3.';
      return;
    }
    credenciales = [...credenciales, { ...actual }];
    actual = { ...vacia };
  }

  function quitar(i: number) {
    credenciales = credenciales.filter((_, j) => j !== i);
  }

  function continuar() {
    const dtos = credenciales.map((c) => ({
      nombre: c.nombre,
      tipo: c.tipo,
      usuario: c.usuario || undefined,
      password: c.password || undefined,
      community: c.community || undefined,
      authProtocol: c.authProtocol || undefined,
      authPassphrase: c.authPassphrase || undefined,
      privProtocol: c.privProtocol || undefined,
      privPassphrase: c.privPassphrase || undefined
    })) as app.CredencialDTO[];
    onContinuar(dtos);
  }
</script>

<section class="mx-auto flex max-w-2xl flex-col gap-4 p-6">
  <header>
    <h2 class="text-xl font-semibold text-sys-profundo">Credenciales del cliente</h2>
    <p class="mt-1 text-sm text-sys-neutro">
      Se usan solo para este escaneo y se guardan en el almacén seguro de esta notebook.
      <strong>Se borran solas al terminar</strong> y nunca se envían a AuditApp.
    </p>
  </header>

  {#if credenciales.length > 0}
    <ul class="flex flex-col gap-2">
      {#each credenciales as c, i}
        <li class="sys-card flex items-center justify-between p-3 text-sm">
          <span><strong>{c.nombre}</strong> <span class="text-sys-neutro">({c.tipo})</span></span>
          <button class="text-sys-rojo hover:underline" onclick={() => quitar(i)}>Quitar</button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="sys-card flex flex-col gap-3 p-4">
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-sys-neutro">Nombre</span>
        <input class="sys-field" bind:value={actual.nombre} placeholder="dominio Windows" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-sys-neutro">Tipo</span>
        <select class="sys-field" bind:value={actual.tipo}>
          {#each tipos as t}
            <option value={t.valor}>{t.etiqueta}</option>
          {/each}
        </select>
      </label>
    </div>

    {#if actual.tipo === 'windows' || actual.tipo === 'ssh'}
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-sys-neutro">Usuario</span>
          <input class="sys-field" bind:value={actual.usuario} placeholder={actual.tipo === 'windows' ? 'DOMINIO\\usuario' : 'root'} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-sys-neutro">Contraseña</span>
          <input class="sys-field" type="password" bind:value={actual.password} />
        </label>
      </div>
    {:else if actual.tipo === 'snmp'}
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-sys-neutro">Community</span>
        <input class="sys-field" bind:value={actual.community} placeholder="public" />
      </label>
    {:else if actual.tipo === 'snmp_v3'}
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-sys-neutro">Usuario</span>
          <input class="sys-field" bind:value={actual.usuario} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-sys-neutro">Protocolo auth</span>
          <select class="sys-field" bind:value={actual.authProtocol}>
            <option>SHA</option><option>MD5</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-sys-neutro">Passphrase auth</span>
          <input class="sys-field" type="password" bind:value={actual.authPassphrase} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-sys-neutro">Protocolo privacidad</span>
          <select class="sys-field" bind:value={actual.privProtocol}>
            <option>AES</option><option>DES</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-sys-neutro">Passphrase privacidad</span>
          <input class="sys-field" type="password" bind:value={actual.privPassphrase} />
        </label>
      </div>
    {/if}

    {#if error}
      <p class="rounded-sys bg-red-50 p-2 text-sm text-sys-rojo">{error}</p>
    {/if}

    <button class="sys-btn-secondary self-start" onclick={agregar}>+ Agregar credencial</button>
  </div>

  <div class="flex justify-between">
    <button class="sys-btn-secondary" onclick={onVolver}>Volver</button>
    <button class="sys-btn-primary" onclick={continuar} data-testid="btn-credenciales-continuar">
      {credenciales.length === 0 ? 'Continuar sin credenciales' : `Continuar con ${credenciales.length}`}
    </button>
  </div>

  {#if credenciales.length === 0}
    <p class="text-xs text-sys-neutro">
      Sin credenciales el escaneo detecta equipos y puertos, pero no el detalle de cada máquina
      (software, hardware, serial).
    </p>
  {/if}
</section>
