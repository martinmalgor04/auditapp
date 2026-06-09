<script lang="ts">
  type TemplateItemRow = {
    id: string;
    label: string;
    help: string | null;
    method: string[];
    fieldType: string;
    options: Record<string, unknown>;
    filledBy: string;
    sortOrder: number;
  };

  let { item }: { item: TemplateItemRow } = $props();
</script>

<form method="POST" action="?/updateItem" class="rounded border border-slate-200 p-4 space-y-3 bg-slate-50">
  <input type="hidden" name="itemId" value={item.id} />

  <label class="block space-y-1">
    <span class="text-xs font-medium text-slate-600">Label</span>
    <input
      type="text"
      name="label"
      value={item.label}
      required
      class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
    />
  </label>

  <label class="block space-y-1">
    <span class="text-xs font-medium text-slate-600">Ayuda</span>
    <textarea
      name="help"
      rows="2"
      class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
    >{item.help ?? ''}</textarea>
  </label>

  <label class="block space-y-1">
    <span class="text-xs font-medium text-slate-600">Método (O,E,C,X)</span>
    <input
      type="text"
      name="method"
      value={item.method.join(',')}
      class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
    />
  </label>

  <label class="block space-y-1">
    <span class="text-xs font-medium text-slate-600">Completado por</span>
    <select name="filled_by" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
      <option value="admin" selected={item.filledBy === 'admin'}>admin</option>
      <option value="cliente" selected={item.filledBy === 'cliente'}>cliente</option>
      <option value="tecnico" selected={item.filledBy === 'tecnico'}>tecnico</option>
    </select>
  </label>

  <label class="block space-y-1">
    <span class="text-xs font-medium text-slate-600">Options (JSON)</span>
    <textarea
      name="options"
      rows="3"
      class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono text-xs"
    >{JSON.stringify(item.options, null, 2)}</textarea>
  </label>

  <p class="text-xs text-slate-500">Tipo: {item.fieldType} · Orden: {item.sortOrder}</p>

  <button
    type="submit"
    class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
  >
    Guardar ítem
  </button>
</form>
