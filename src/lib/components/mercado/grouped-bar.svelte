<script lang="ts">
  type ErpGroup = 'tango' | 'competidor' | 'sin_erp';
  type Cut = {
    key: string;
    n: number;
    groups: Record<ErpGroup, number> | null;
    suppressed: boolean;
  };

  let {
    cuts,
    testId = 'mercado-grouped-bar'
  }: {
    cuts: Cut[];
    testId?: string;
  } = $props();

  const GROUP_META: ReadonlyArray<{ group: ErpGroup; label: string; color: string }> = [
    { group: 'tango', label: 'Tango', color: 'var(--sys-primary)' },
    { group: 'competidor', label: 'Competidor', color: 'var(--sys-naranja)' },
    { group: 'sin_erp', label: 'Sin ERP', color: 'var(--sys-gris-neutro)' }
  ];

  const maxN = $derived(Math.max(...cuts.map((c) => c.n), 1));
</script>

<div class="space-y-3" data-testid={testId}>
  <div class="flex flex-wrap gap-3 text-xs text-[var(--sys-text-muted-light)]">
    {#each GROUP_META as meta (meta.group)}
      <span class="inline-flex items-center gap-1">
        <span class="h-3 w-3 rounded-sm" style={`background:${meta.color}`}></span>
        {meta.label}
      </span>
    {/each}
  </div>

  {#each cuts as cut (cut.key)}
    <div class="text-sm">
      <div class="mb-1 flex items-center justify-between">
        <span class="font-medium text-[var(--sys-text-on-light)]">{cut.key}</span>
        <span class="text-[var(--sys-text-muted-light)]">n={cut.n}</span>
      </div>
      {#if cut.suppressed || cut.groups === null}
        <p class="text-xs text-[var(--sys-text-muted-light)]" data-testid="mercado-suppressed">
          Muestra insuficiente (n &lt; 3)
        </p>
      {:else}
        <div
          class="flex h-5 w-full overflow-hidden rounded-sm bg-[var(--sys-offwhite)]"
          style={`width:${(cut.n / maxN) * 100}%`}
        >
          {#each GROUP_META as meta (meta.group)}
            {@const value = cut.groups[meta.group]}
            {#if value > 0}
              <div
                class="h-full"
                style={`flex:${value} 0 0;background:${meta.color}`}
                title={`${meta.label}: ${value}`}
              ></div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
