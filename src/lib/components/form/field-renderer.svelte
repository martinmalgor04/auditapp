<script lang="ts">
  import type { FieldType } from '$lib/server/db/field-schemas';
  import BoolField from './fields/bool-field.svelte';
  import DateField from './fields/date-field.svelte';
  import ListField from './fields/list-field.svelte';
  import MultiselectField from './fields/multiselect-field.svelte';
  import NumberField from './fields/number-field.svelte';
  import SelectField from './fields/select-field.svelte';
  import TextField from './fields/text-field.svelte';
  import TriField from './fields/tri-field.svelte';

  export type FieldItem = {
    id: string;
    label: string;
    helpText: string | null;
    fieldType: FieldType;
    options: unknown;
    required: boolean;
    value: unknown;
  };

  let {
    item,
    onchange
  }: {
    item: FieldItem;
    onchange?: (value: unknown) => void;
  } = $props();

  const opts = $derived((item.options ?? {}) as { choices?: string[] });
  const choices = $derived(opts.choices ?? []);

  let textValue = $state('');
  let numberValue = $state<number | ''>('');
  let boolValue = $state(false);
  let triValue = $state<'si' | 'no' | 'parcial' | ''>('');
  let selectValue = $state('');
  let multiselectValue = $state<string[]>([]);
  let dateValue = $state('');
  let listValue = $state<string[]>(['']);

  $effect(() => {
    const v = item.value;
    switch (item.fieldType) {
      case 'text':
        textValue = typeof v === 'string' ? v : '';
        break;
      case 'number':
      case 'money':
        numberValue = typeof v === 'number' ? v : '';
        break;
      case 'bool':
        boolValue = Boolean(v);
        break;
      case 'tri':
        triValue = (v as 'si' | 'no' | 'parcial') ?? '';
        break;
      case 'select':
        selectValue = typeof v === 'string' ? v : '';
        break;
      case 'multiselect':
        multiselectValue = Array.isArray(v) ? (v as string[]) : [];
        break;
      case 'date':
      case 'datetime':
        dateValue = typeof v === 'string' ? v : '';
        break;
      case 'list':
        listValue = Array.isArray(v) && v.length > 0 ? (v as string[]) : [''];
        break;
    }
  });

  function currentValue(): unknown {
    switch (item.fieldType) {
      case 'text':
        return textValue;
      case 'number':
      case 'money':
        return numberValue === '' ? null : numberValue;
      case 'bool':
        return boolValue;
      case 'tri':
        return triValue || null;
      case 'select':
        return selectValue || null;
      case 'multiselect':
        return multiselectValue;
      case 'date':
      case 'datetime':
        return dateValue || null;
      case 'list':
        return listValue.filter((s) => s.trim() !== '');
      default:
        return null;
    }
  }

  function emitChange() {
    onchange?.(currentValue());
  }
</script>

{#if item.fieldType === 'text'}
  <TextField id={item.id} label={item.label} helpText={item.helpText} bind:value={textValue} required={item.required} onchange={emitChange} />
{:else if item.fieldType === 'number' || item.fieldType === 'money'}
  <NumberField id={item.id} label={item.label} helpText={item.helpText} bind:value={numberValue} required={item.required} onchange={emitChange} />
{:else if item.fieldType === 'bool'}
  <BoolField id={item.id} label={item.label} helpText={item.helpText} bind:value={boolValue} onchange={emitChange} />
{:else if item.fieldType === 'tri'}
  <TriField id={item.id} label={item.label} helpText={item.helpText} bind:value={triValue} onchange={emitChange} />
{:else if item.fieldType === 'select'}
  <SelectField id={item.id} label={item.label} helpText={item.helpText} {choices} bind:value={selectValue} required={item.required} onchange={emitChange} />
{:else if item.fieldType === 'multiselect'}
  <MultiselectField id={item.id} label={item.label} helpText={item.helpText} {choices} bind:value={multiselectValue} onchange={emitChange} />
{:else if item.fieldType === 'date' || item.fieldType === 'datetime'}
  <DateField id={item.id} label={item.label} helpText={item.helpText} bind:value={dateValue} required={item.required} onchange={emitChange} />
{:else if item.fieldType === 'list'}
  <ListField id={item.id} label={item.label} helpText={item.helpText} bind:value={listValue} onchange={emitChange} />
{/if}
