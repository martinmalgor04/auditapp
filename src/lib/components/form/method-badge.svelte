<script lang="ts">
  const labels: Record<string, string> = {
    O: 'Observación',
    E: 'Entrevista',
    C: 'Configuración',
    X: 'Externo'
  };

  let { method }: { method: 'O' | 'E' | 'C' | 'X' } = $props();
</script>

<span
  class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
  title={labels[method]}
>
  {labels[method]}
</span>
