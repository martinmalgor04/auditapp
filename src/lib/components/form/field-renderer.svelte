<script lang="ts">
  import type { FieldType } from '$lib/server/db/field-schemas';
  import type { ItemStatus } from '$lib/client/form/item-status';
  import MethodBadge from './method-badge.svelte';
  import PreloadedBadge from './preloaded-badge.svelte';
  import BoolField from './fields/bool-field.svelte';
  import DateField from './fields/date-field.svelte';
  import DatetimeField from './fields/datetime-field.svelte';
  import FieldFileRef from './fields/field-file-ref.svelte';
  import FieldTable, { type TableColumn, type TableRow } from './fields/field-table.svelte';
  import type { SaveIndicatorState } from '$lib/components/form/save-indicator.svelte';
  import ListField from './fields/list-field.svelte';
  import MoneyField from './fields/money-field.svelte';
  import MultiselectField from './fields/multiselect-field.svelte';
  import NumberField from './fields/number-field.svelte';
  import SelectField from './fields/select-field.svelte';
  import TextField from './fields/text-field.svelte';
  import TriField from './fields/tri-field.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import type { TriValue } from './QuestionCard.svelte';

  export type FieldItem = {
    id: string;
    label: string;
    helpText: string | null;
    fieldType: FieldType;
    options: unknown;
    method?: 'O' | 'E' | 'C' | 'X';
    required: boolean;
    allowNa?: boolean;
    value: unknown;
    na?: boolean;
    notes?: string | null;
    preloaded?: boolean;
  };

  let {
    item,
    status = 'pendiente' as ItemStatus,
    saveState = 'idle' as SaveIndicatorState,
    onchange,
    onnoteschange,
    onnchange,
    oncamera,
    onphotocapture,
    onphotogallery,
    onphotodelete
  }: {
    item: FieldItem;
    status?: ItemStatus;
    saveState?: SaveIndicatorState;
    onchange?: (value: unknown) => void;
    onnoteschange?: (notes: string) => void;
    onnchange?: (na: boolean) => void;
    /** Pasa también las filas VIVAS para que el flujo de foto nunca use un snapshot viejo. */
    oncamera?: (
      rowId: string,
      currentRows: TableRow[]
    ) => void | Promise<{ rows: TableRow[] } | void>;
    onphotocapture?: () => void;
    onphotogallery?: () => void;
    onphotodelete?: (
      attachmentId: string,
      rowId?: string,
      currentRows?: TableRow[]
    ) => Promise<{ rows?: TableRow[] } | null | void>;
  } = $props();

  const opts = $derived((item.options ?? {}) as {
    choices?: string[];
    columns?: TableColumn[];
    currency?: string;
  });
  const choices = $derived(opts.choices ?? []);
  const columns = $derived(opts.columns ?? []);
  const currency = $derived(opts.currency ?? 'ARS');

  let textValue = $state('');
  let numberValue = $state<number | ''>('');
  let boolValue = $state<boolean | null>(null);
  let triValue = $state<'si' | 'no' | 'parcial' | ''>('');
  let selectValue = $state('');
  let multiselectValue = $state<string[]>([]);
  let dateValue = $state('');
  let datetimeValue = $state('');
  let listValue = $state<string[]>(['']);
  let tableRows = $state<TableRow[]>([]);
  let attachmentIds = $state<string[]>([]);
  let notesValue = $state('');
  let naValue = $state(false);

  function parseTableValue(v: unknown): TableRow[] {
    if (v && typeof v === 'object' && 'rows' in v && Array.isArray((v as { rows: unknown }).rows)) {
      return (v as { rows: TableRow[] }).rows;
    }
    if (Array.isArray(v)) {
      return v.map((cells) => ({
        row_id: crypto.randomUUID(),
        cells: cells as Record<string, unknown>,
        attachment_ids: []
      }));
    }
    return [];
  }

  function parseFileRef(v: unknown): string[] {
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v as string[];
    if (v && typeof v === 'object' && 'attachment_ids' in v) {
      return (v as { attachment_ids: string[] }).attachment_ids ?? [];
    }
    return [];
  }

  $effect(() => {
    const v = item.value;
    naValue = item.na ?? false;
    notesValue = item.notes ?? '';
    switch (item.fieldType) {
      case 'text':
        textValue = typeof v === 'string' ? v : '';
        break;
      case 'number':
        numberValue = typeof v === 'number' ? v : '';
        break;
      case 'money':
        numberValue = typeof v === 'number' ? v : '';
        break;
      case 'bool':
        boolValue = v === true ? true : v === false ? false : null;
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
        dateValue = typeof v === 'string' ? v : '';
        break;
      case 'datetime':
        datetimeValue = typeof v === 'string' ? v : '';
        break;
      case 'list':
        listValue = Array.isArray(v) && v.length > 0 ? (v as string[]) : [''];
        break;
      case 'table':
        tableRows = parseTableValue(v);
        break;
      case 'file_ref':
        attachmentIds = parseFileRef(v);
        break;
    }
  });

  function currentValue(): unknown {
    if (naValue) return null;
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
        return dateValue || null;
      case 'datetime':
        return datetimeValue || null;
      case 'list':
        return listValue.filter((s) => s.trim() !== '');
      case 'table':
        return { rows: tableRows };
      case 'file_ref':
        return { attachment_ids: attachmentIds };
      default:
        return null;
    }
  }

  function emitChange() {
    onchange?.(currentValue());
  }

  function toggleNa() {
    naValue = !naValue;
    onnchange?.(naValue);
    onchange?.(currentValue());
  }
</script>

<article id="item-{item.id}" class="space-y-2 rounded-lg border border-slate-100 p-3" data-field-type={item.fieldType}>
  <div class="flex flex-wrap items-center gap-2">
    {#if item.method}
      <MethodBadge method={item.method} />
    {/if}
    <PreloadedBadge visible={item.preloaded ?? false} />
    {#if item.allowNa}
      <button
        type="button"
        class="min-h-[var(--sys-touch-min)] rounded-full border px-3 text-xs font-medium
          {naValue ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-300 text-slate-600'}"
        onclick={toggleNa}
      >
        N/A
      </button>
    {/if}
    <span
      class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
        {status === 'con_observacion'
          ? 'border border-sys-naranja/40 bg-sys-naranja/10 text-sys-naranja'
          : status === 'respondido'
            ? 'border border-sys-electrico/30 bg-sys-electrico/10 text-sys-electrico'
            : 'border border-slate-200 bg-slate-50 text-slate-500'}"
      data-item-status={status}
      aria-label="Estado: {status === 'con_observacion' ? 'con observación' : status}"
    >
      {status === 'con_observacion' ? '⚠' : status === 'respondido' ? '✓' : '○'}
      {status === 'con_observacion' ? 'observación' : status === 'respondido' ? 'respondido' : 'pendiente'}
    </span>
  </div>

  {#if !naValue}
    {#if item.fieldType === 'text'}
      <TextField id={item.id} label={item.label} helpText={item.helpText} bind:value={textValue} required={item.required} onchange={emitChange} />
    {:else if item.fieldType === 'number'}
      <NumberField id={item.id} label={item.label} helpText={item.helpText} bind:value={numberValue} required={item.required} onchange={emitChange} />
    {:else if item.fieldType === 'money'}
      <MoneyField id={item.id} label={item.label} helpText={item.helpText} {currency} bind:value={numberValue} required={item.required} onchange={emitChange} />
    {:else if item.fieldType === 'bool'}
      <QuestionCard
        question={item.label}
        value={boolValue === true ? 'si' : boolValue === false ? 'no' : null}
        hasObservation={!!notesValue}
        onChange={(v: TriValue) => {
          boolValue = v === 'si' ? true : v === 'no' ? false : null;
          emitChange();
        }}
        onAddObservation={() => {}}
      />
    {:else if item.fieldType === 'tri'}
      <QuestionCard
        question={item.label}
        value={triValue || null}
        hasObservation={!!notesValue}
        onChange={(v: TriValue) => {
          triValue = v ?? '';
          emitChange();
        }}
        onAddObservation={() => {}}
      />
    {:else if item.fieldType === 'select'}
      <SelectField id={item.id} label={item.label} helpText={item.helpText} {choices} bind:value={selectValue} required={item.required} onchange={emitChange} />
    {:else if item.fieldType === 'multiselect'}
      <MultiselectField id={item.id} label={item.label} helpText={item.helpText} {choices} bind:value={multiselectValue} onchange={emitChange} />
    {:else if item.fieldType === 'date'}
      <DateField id={item.id} label={item.label} helpText={item.helpText} bind:value={dateValue} required={item.required} onchange={emitChange} />
    {:else if item.fieldType === 'datetime'}
      <DatetimeField id={item.id} label={item.label} helpText={item.helpText} bind:value={datetimeValue} required={item.required} onchange={emitChange} />
    {:else if item.fieldType === 'list'}
      <ListField id={item.id} label={item.label} helpText={item.helpText} bind:value={listValue} onchange={emitChange} />
    {:else if item.fieldType === 'table'}
      <FieldTable
        id={item.id}
        label={item.label}
        helpText={item.helpText}
        {columns}
        bind:rows={tableRows}
        {saveState}
        onchange={emitChange}
        oncamera={async (rowId) => {
          const snapshot = $state.snapshot(tableRows) as TableRow[];
          const merged = await oncamera?.(rowId, snapshot);
          if (merged?.rows) tableRows = merged.rows;
        }}
        onremovephoto={async (rowId, attachmentId) => {
          const snapshot = $state.snapshot(tableRows) as TableRow[];
          const merged = await onphotodelete?.(attachmentId, rowId, snapshot);
          if (merged?.rows) tableRows = merged.rows;
        }}
      />
    {:else if item.fieldType === 'file_ref'}
      <FieldFileRef
        id={item.id}
        label={item.label}
        helpText={item.helpText}
        bind:attachmentIds
        oncapture={onphotocapture}
        ongallery={onphotogallery}
        onremovephoto={async (attachmentId) => {
          const result = await onphotodelete?.(attachmentId);
          if (result !== null) {
            attachmentIds = attachmentIds.filter((id) => id !== attachmentId);
          }
        }}
      />
    {/if}
  {:else}
    <p class="text-sm font-medium text-slate-500">{item.label} — N/A</p>
  {/if}

  <details class="text-sm">
    <summary class="cursor-pointer text-slate-600 min-h-[var(--sys-touch-min)] flex items-center">
      Observaciones
    </summary>
    <textarea
      class="mt-2 w-full rounded border border-slate-300 p-2 text-sm min-h-[4rem]"
      bind:value={notesValue}
      oninput={() => onnoteschange?.(notesValue)}
    ></textarea>
  </details>
</article>
