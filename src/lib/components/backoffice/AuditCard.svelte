<script lang="ts">
  import type { AuditListItem } from '$lib/types';
  import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
  import ChipPill from '$lib/components/ui/ChipPill.svelte';
  import ItemProgressBar from '$lib/components/ui/ItemProgressBar.svelte';

  export let audit: AuditListItem;
</script>

<div class="bg-white rounded-xl shadow-[0_1px_4px_rgba(0,0,0,.08)] p-3">
  <!-- Fila superior: nombre cliente | ref_code + StatusBadge -->
  <div class="flex items-start justify-between gap-2 mb-2">
    <span class="text-[11px] font-bold text-[--sys-text-primary] truncate">{audit.client_name}</span>
    <div class="flex items-center gap-1.5 shrink-0">
      <span class="text-[10px] font-semibold text-[--sys-primary]">{audit.ref_code}</span>
      <StatusBadge status={audit.status} scoreLow={audit.score_low} />
    </div>
  </div>
  <!-- Chips de tipo + segmento -->
  <div class="flex gap-1.5 mb-2">
    {#each audit.types as t}
      <ChipPill label={t} variant={t === 'ERP' ? 'green' : 'blue'} />
    {/each}
    {#if audit.segment}
      <ChipPill label={audit.segment} variant="gray" />
    {/if}
  </div>
  <!-- Barra de progreso -->
  <ItemProgressBar value={audit.progress} status={audit.status} />
  <!-- Técnico + fecha -->
  {#if audit.assigned_tech_name || audit.scheduled_at}
    <p class="text-[11px] text-[--sys-text-muted] mt-2">
      {audit.assigned_tech_name ?? '—'} · {audit.scheduled_at ?? ''}
    </p>
  {/if}
  <!-- Botones -->
  <div class="flex gap-2 mt-3">
    <a href="/auditorias/{audit.id}" class="flex-1 text-center py-1.5 text-xs border border-[--sys-border] rounded-lg text-[--sys-text-secondary]">Ver</a>
    <a href="/auditorias/{audit.id}/form" class="flex-1 text-center py-1.5 text-xs bg-[--sys-primary] text-white rounded-lg font-medium">Relevamiento</a>
    <a href="/auditorias/{audit.id}/cierre" class="flex-1 text-center py-1.5 text-xs border border-[--sys-border] rounded-lg text-[--sys-text-secondary]">Cierre</a>
  </div>
</div>
