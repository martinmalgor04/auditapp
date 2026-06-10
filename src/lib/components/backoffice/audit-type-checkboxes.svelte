<script lang="ts">
  import { AUDIT_TYPES, AUDIT_TYPE_LABELS, type AuditType } from '$lib/audit-types';

  let {
    selected = [],
    name = 'auditTypes',
    legend = 'Especialidades',
    hint = 'Sin selección = ve y trabaja todos los tipos.'
  }: {
    selected?: AuditType[];
    name?: string;
    legend?: string;
    hint?: string;
  } = $props();
</script>

<fieldset class="space-y-2">
  <legend class="text-sm font-semibold text-slate-800">{legend}</legend>
  {#if hint}
    <p class="text-xs text-slate-500">{hint}</p>
  {/if}
  <div class="flex flex-wrap gap-4 text-sm">
    {#each AUDIT_TYPES as type}
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          {name}
          value={type}
          checked={selected.includes(type)}
        />
        {AUDIT_TYPE_LABELS[type]}
      </label>
    {/each}
  </div>
</fieldset>
