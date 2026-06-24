<script module lang="ts">
  export interface ErpBar { erp: string; pct: number; color: string }
</script>

<script lang="ts">
  export let data: ErpBar[];
</script>

<div class="bg-white rounded-xl p-4 shadow-sm">
  <h3 class="text-sm font-semibold text-[--sys-text-primary] mb-3">Distribución ERP</h3>
  {#if data.length === 0}
    <p class="text-sm text-[--sys-text-muted] text-center py-4">Sin auditorías cerradas</p>
  {:else}
    <div class="space-y-2">
      {#each data as bar}
        <div class="flex items-center gap-3">
          <span class="text-xs text-[--sys-text-secondary] w-24 shrink-0">{bar.erp}</span>
          <div class="flex-1 h-[6px] rounded-full bg-[--sys-border]">
            <div class="h-full rounded-full" style="width: {bar.pct}%; background: {bar.color}"></div>
          </div>
          <span class="text-xs text-[--sys-text-muted] w-8 text-right">{bar.pct}%</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
