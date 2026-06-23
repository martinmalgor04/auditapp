<script lang="ts">
  // Sección «Informe IA» del detalle de auditoría (R15, R27).
  import { invalidateAll } from '$app/navigation';
  import ReportStatusBadge from './report-status-badge.svelte';
  import { startReportPolling } from '$lib/client/informe/polling';

  type ReportListItem = {
    report_id: string;
    version: number;
    status: string;
    created_at: string;
    approved_by: string | null;
    approved_at: string | null;
    error_message: string | null;
    stale_since?: string | null;
  };

  let {
    auditId,
    reports,
    isAdmin,
    canGenerate
  }: {
    auditId: string;
    reports: ReportListItem[];
    isAdmin: boolean;
    canGenerate: boolean;
  } = $props();

  let items = $state([...reports]);
  let generating = $state(false);
  let errorMessage = $state('');
  let stopPolling: (() => void) | undefined;

  function watch(version: number): void {
    stopPolling?.();
    stopPolling = startReportPolling(auditId, version, (payload) => {
      items = items.map((r) => (r.version === payload.version ? { ...r, ...payload } : r));
    });
  }

  $effect(() => {
    const inflight = items.find((r) => r.status === 'pendiente' || r.status === 'generando');
    if (inflight) watch(inflight.version);
    return () => stopPolling?.();
  });

  async function generate(): Promise<void> {
    generating = true;
    errorMessage = '';
    try {
      const res = await fetch(`/api/audits/${auditId}/report`, { method: 'POST' });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        data?: { report_id: string; version: number; status: string };
      } | null;
      if (res.ok && body?.data) {
        items = [
          {
            report_id: body.data.report_id,
            version: body.data.version,
            status: body.data.status,
            created_at: new Date().toISOString(),
            approved_by: null,
            approved_at: null,
            error_message: null
          },
          ...items
        ];
        await invalidateAll();
      } else {
        errorMessage = body?.error ?? 'No se pudo generar el informe';
      }
    } finally {
      generating = false;
    }
  }
</script>

<section class="sys-card-pad space-y-4" data-testid="informe-section">
  <h2 class="sys-section-title">Informe IA</h2>

  {#if errorMessage}
    <p class="text-sm text-sys-rojo" role="alert">{errorMessage}</p>
  {/if}

  {#if canGenerate}
    <button type="button" class="sys-btn-primary" onclick={generate} disabled={generating}>
      {generating ? 'Generando…' : 'Generar informe'}
    </button>
  {/if}

  {#if items.length === 0}
    <p class="sys-muted text-sm">Todavía no hay informes generados.</p>
  {:else}
    <ul class="divide-y divide-sys-offwhite">
      {#each items as report (report.report_id)}
        <li class="flex flex-wrap items-center justify-between gap-3 py-3">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-3">
              <span class="font-semibold">v{report.version}</span>
              <ReportStatusBadge status={report.status} />
              {#if report.status === 'error' && report.error_message}
                <span class="text-xs text-sys-rojo">{report.error_message}</span>
              {/if}
            </div>
            {#if report.stale_since}
              <p class="text-xs text-sys-naranja" role="alert">
                Este informe puede estar desactualizado respecto del relevamiento actual.
              </p>
            {/if}
          </div>
          <div class="flex items-center gap-3 text-sm">
            {#if isAdmin && (report.status === 'borrador' || report.status === 'aprobado' || report.status === 'error')}
              <a
                href="/auditorias/{auditId}/informe/{report.version}"
                class="font-medium text-sys-electrico hover:underline"
              >
                Revisar
              </a>
            {/if}
            {#if report.status === 'aprobado'}
              <a
                href="/auditorias/{auditId}/informe/{report.version}/imprimir"
                class="font-medium text-sys-electrico hover:underline"
              >
                Imprimir
              </a>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>
