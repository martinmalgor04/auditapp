<script lang="ts">
  import NumberField from './number-field.svelte';

  let {
    id,
    label,
    helpText,
    value = $bindable<number | ''>(''),
    required = false,
    currency = 'ARS',
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    value?: number | '';
    required?: boolean;
    currency?: string;
    onchange?: () => void;
  } = $props();
</script>

<div class="relative">
  <NumberField {id} {label} {helpText} bind:value {required} {onchange} />
  <span class="absolute right-3 top-[2.6rem] text-xs text-slate-500">{currency}</span>
</div>
