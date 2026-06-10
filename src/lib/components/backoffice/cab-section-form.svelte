<script lang="ts">
  type CabItem = {
    id: string;
    label: string;
    fieldType: string;
    filledBy: string;
    required: boolean;
    options: Record<string, unknown>;
    value?: unknown;
    na?: boolean;
  };

  let {
    items,
    readonly = false
  }: {
    items: CabItem[];
    readonly?: boolean;
  } = $props();

  function displayValue(item: CabItem): string {
    if (item.value === null || item.value === undefined || item.value === 'null') {
      return '';
    }
    if (typeof item.value === 'string') {
      return item.value;
    }
    return String(item.value);
  }
</script>

{#if items.length > 0}
  <fieldset class="space-y-3 rounded-lg border border-slate-200 p-4">
    <legend class="text-sm font-semibold text-slate-800 px-1">Cabecera (CAB)</legend>
    {#each items as item (item.id)}
      <label class="block space-y-1">
        <span class="text-sm font-medium text-slate-700">
          {item.label}
          {#if item.required}<span class="text-red-500">*</span>{/if}
          <span class="text-xs text-slate-400 font-normal">({item.filledBy})</span>
        </span>
        {#if readonly}
          <p class="text-sm text-slate-800 py-2">{displayValue(item) || '—'}</p>
        {:else}
          {#key displayValue(item)}
            {#if item.fieldType === 'number'}
              <input
                type="number"
                name="cab_{item.id}"
                value={displayValue(item)}
                required={item.required}
                class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            {:else if item.fieldType === 'date'}
              <input
                type="date"
                name="cab_{item.id}"
                value={displayValue(item)}
                required={item.required}
                class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            {:else}
              <input
                type="text"
                name="cab_{item.id}"
                value={displayValue(item)}
                required={item.required}
                class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            {/if}
          {/key}
        {/if}
      </label>
    {/each}
  </fieldset>
{/if}
