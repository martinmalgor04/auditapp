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
  <fieldset class="sys-card-pad space-y-4">
    <legend class="sys-section-title float-left mb-3 w-full px-0">Cabecera (CAB)</legend>
    {#each items as item (item.id)}
      <label class="block space-y-1.5">
        <span class="sys-field-label">
          {item.label}
          {#if item.required}<span class="text-sys-rojo">*</span>{/if}
          <span class="text-xs font-normal text-[var(--sys-text-muted-light)]">({item.filledBy})</span>
        </span>
        {#if readonly}
          <p class="py-2 text-sm text-sys-medio">{displayValue(item) || '—'}</p>
        {:else}
          {#key displayValue(item)}
            {#if item.fieldType === 'number'}
              <input
                type="number"
                name="cab_{item.id}"
                value={displayValue(item)}
                required={item.required}
                class="sys-field"
              />
            {:else if item.fieldType === 'date'}
              <input
                type="date"
                name="cab_{item.id}"
                value={displayValue(item)}
                required={item.required}
                class="sys-field"
              />
            {:else}
              <input
                type="text"
                name="cab_{item.id}"
                value={displayValue(item)}
                required={item.required}
                class="sys-field"
              />
            {/if}
          {/key}
        {/if}
      </label>
    {/each}
  </fieldset>
{/if}

<style>
  fieldset {
    border: none;
    min-inline-size: 0;
  }
</style>
