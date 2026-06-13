<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { ShareView } from '$lib/informe/share-view';

  let {
    auditId,
    version,
    shares
  }: { auditId: string; version: number; shares: ShareView[] } = $props();

  const current = $derived(shares[0] ?? null);
  const history = $derived(shares.slice(1));

  let expiresInDays = $state('90');
  let busy = $state(false);
  let panelError = $state('');
  let copied = $state(false);

  const apiPath = $derived(`/api/audits/${auditId}/report/${version}/share`);

  function fecha(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function call(method: 'POST' | 'DELETE', body?: unknown): Promise<void> {
    busy = true;
    panelError = '';
    try {
      const res = await fetch(apiPath, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) {
        const parsed = (await res.json().catch(() => null)) as { error?: string } | null;
        panelError = parsed?.error ?? 'La acción falló';
        return;
      }
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  function generate(): void {
    const days = expiresInDays === 'null' ? null : Number(expiresInDays);
    void call('POST', { expires_in_days: days });
  }

  async function copyUrl(): Promise<void> {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      panelError = 'No se pudo copiar el link';
    }
  }
</script>

<!-- Entrega al cliente (#15): generar/regenerar/revocar link público + métricas. -->
<div class="sys-card-pad space-y-4" data-testid="share-panel">
  <h2 class="sys-section-title">Entrega al cliente</h2>

  {#if panelError}
    <p class="text-sm text-sys-rojo" role="alert">{panelError}</p>
  {/if}

  {#if current}
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide
            {current.estado === 'activo'
            ? 'bg-sys-verde/10 text-sys-verde'
            : current.estado === 'revocado'
              ? 'bg-sys-rojo/10 text-sys-rojo'
              : 'bg-sys-naranja/10 text-sys-naranja'}"
          data-testid="share-estado"
        >
          {current.estado}
        </span>
        <span class="text-sm text-sys-medio">
          Generado por {current.created_by_name} el {fecha(current.created_at)}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <code class="max-w-full overflow-x-auto rounded bg-sys-offwhite px-3 py-2 text-xs">
          {current.url}
        </code>
        <button
          type="button"
          class="sys-btn-secondary"
          data-testid="copy-share-link"
          data-url={current.url}
          onclick={copyUrl}
        >
          {copied ? 'Copiado' : 'Copiar link'}
        </button>
      </div>

      <dl class="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <div class="flex gap-2">
          <dt class="text-sys-medio">Vence:</dt>
          <dd>{current.expires_at ? fecha(current.expires_at) : 'Sin vencimiento'}</dd>
        </div>
        <div class="flex gap-2">
          <dt class="text-sys-medio">Vistas:</dt>
          <dd data-testid="share-view-count">{current.view_count}</dd>
        </div>
        <div class="flex gap-2">
          <dt class="text-sys-medio">Primera vista:</dt>
          <dd>{fecha(current.first_viewed_at)}</dd>
        </div>
        <div class="flex gap-2">
          <dt class="text-sys-medio">Última vista:</dt>
          <dd>{fecha(current.last_viewed_at)}</dd>
        </div>
        {#if current.revoked_at}
          <div class="flex gap-2">
            <dt class="text-sys-medio">Revocado:</dt>
            <dd>{fecha(current.revoked_at)}</dd>
          </div>
        {/if}
      </dl>
    </div>
  {:else}
    <p class="text-sm text-sys-medio">
      Todavía no se generó un link de entrega para esta versión del informe.
    </p>
  {/if}

  <div class="flex flex-wrap items-end gap-3">
    <label class="block space-y-1.5">
      <span class="sys-field-label">Expiración del link</span>
      <select class="sys-field" bind:value={expiresInDays} disabled={busy}>
        <option value="30">30 días</option>
        <option value="90">90 días</option>
        <option value="365">365 días</option>
        <option value="null">Sin vencimiento</option>
      </select>
    </label>
    {#if current && current.estado === 'activo'}
      <button
        type="button"
        class="sys-btn-secondary"
        disabled={busy}
        onclick={() =>
          confirm('¿Regenerar el link? El anterior deja de funcionar.') && generate()}
      >
        Regenerar link
      </button>
      <button
        type="button"
        class="sys-btn-secondary text-sys-rojo"
        data-testid="share-revocar"
        disabled={busy}
        onclick={() =>
          confirm('¿Revocar el link? El cliente pierde el acceso.') && call('DELETE')}
      >
        Revocar
      </button>
    {:else}
      <button
        type="button"
        class="sys-btn-primary"
        data-testid="share-generar"
        disabled={busy}
        onclick={generate}
      >
        Generar link de entrega
      </button>
    {/if}
  </div>

  {#if history.length > 0}
    <details class="text-sm">
      <summary class="cursor-pointer text-sys-medio">
        Historial de envíos ({history.length})
      </summary>
      <ul class="mt-2 space-y-1">
        {#each history as item (item.created_at)}
          <li class="text-sys-medio">
            {fecha(item.created_at)} · {item.created_by_name} · {item.estado} ·
            {item.view_count} vistas
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>
