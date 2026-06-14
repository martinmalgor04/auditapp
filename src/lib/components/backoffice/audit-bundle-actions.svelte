<script lang="ts">
  let { auditId }: { auditId: string } = $props();

  type DryRunReport = {
    client: { matched: boolean; willCreate: boolean };
    templates: Array<{ ref: { code: string; version: string }; matched: boolean }>;
    sections: Array<{ section_code: string; matched: boolean }>;
    items: Array<{ matched: boolean }>;
    users: Array<{ email: string; matched: boolean }>;
    missing: string[];
    would_create: string[];
  };

  let bundleText = $state<string | null>(null);
  let report = $state<DryRunReport | null>(null);
  let error = $state<string | null>(null);
  let importing = $state(false);
  let imported = $state<{ auditId: string; duplicate: boolean } | null>(null);

  async function onFileChange(event: Event) {
    error = null;
    report = null;
    imported = null;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    bundleText = await file.text();
    await runDryRun();
  }

  async function postImport(mode: 'dry-run' | 'permissive') {
    if (!bundleText) return null;
    let bundle: unknown;
    try {
      bundle = JSON.parse(bundleText);
    } catch {
      error = 'El archivo no es JSON válido';
      return null;
    }
    const res = await fetch('/api/audits/bundle/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, bundle })
    });
    const body = await res.json();
    if (!res.ok) {
      error = body.error ?? 'Error al procesar el bundle';
      if (Array.isArray(body.missing) && body.missing.length > 0) {
        error += `: faltan ${body.missing.join(', ')}`;
      }
      return null;
    }
    return body.data;
  }

  async function runDryRun() {
    importing = true;
    error = null;
    const data = await postImport('dry-run');
    importing = false;
    if (data) {
      report = data.report as DryRunReport;
    }
  }

  async function confirmImport() {
    importing = true;
    error = null;
    const data = await postImport('permissive');
    importing = false;
    if (data) {
      imported = { auditId: data.audit_id, duplicate: data.duplicate };
      report = null;
    }
  }

  function reset() {
    bundleText = null;
    report = null;
    error = null;
    imported = null;
  }
</script>

<section class="sys-card-pad space-y-4" data-testid="audit-bundle-actions">
  <h2 class="sys-section-title">Export / Import de auditoría</h2>

  <a
    href={`/api/audits/${auditId}/bundle/export`}
    download
    data-testid="export-bundle-link"
    class="sys-btn-secondary inline-block"
  >
    Exportar bundle
  </a>

  <div class="space-y-3 border-t border-sys-gris/20 pt-4">
    <label class="block space-y-1.5">
      <span class="sys-field-label">Importar bundle (JSON)</span>
      <input
        type="file"
        accept="application/json,.json"
        data-testid="import-bundle-file"
        onchange={onFileChange}
        class="sys-field"
      />
    </label>

    {#if importing}
      <p class="text-sm text-sys-medio">Procesando…</p>
    {/if}

    {#if error}
      <p class="text-sm text-sys-rojo" role="alert" data-testid="import-error">{error}</p>
    {/if}

    {#if report && !imported}
      <div class="rounded-sys-app border border-sys-electrico/20 bg-sys-electrico/5 p-4 text-sm"
        data-testid="dry-run-report">
        <p class="font-medium">Vista previa (dry-run)</p>
        <ul class="mt-2 space-y-1">
          <li>Cliente: {report.client.matched ? 'existe' : report.client.willCreate ? 'se creará' : 'falta'}</li>
          <li>Templates: {report.templates.filter((t) => t.matched).length}/{report.templates.length} encontrados</li>
          <li>Ítems: {report.items.filter((i) => i.matched).length}/{report.items.length} resueltos</li>
          <li>Se creará: {report.would_create.join(', ')}</li>
        </ul>
        {#if report.missing.length > 0}
          <p class="mt-2 text-sys-rojo" data-testid="dry-run-missing">
            Faltantes: {report.missing.join(', ')}
          </p>
        {/if}
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="sys-btn-primary"
            disabled={report.missing.length > 0 || importing}
            data-testid="confirm-import"
            onclick={confirmImport}
          >
            Confirmar import
          </button>
          <button type="button" class="sys-btn-secondary" onclick={reset}>Cancelar</button>
        </div>
      </div>
    {/if}

    {#if imported}
      <p class="text-sm text-sys-verde" data-testid="import-success">
        {imported.duplicate
          ? `Ya existía: auditoría ${imported.auditId}`
          : `Importada: auditoría ${imported.auditId}`}
      </p>
    {/if}
  </div>
</section>
