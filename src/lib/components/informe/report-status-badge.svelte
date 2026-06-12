<script lang="ts">
  let { status }: { status: string } = $props();

  const LABELS: Record<string, string> = {
    pendiente: 'Pendiente',
    generando: 'Generando',
    borrador: 'Borrador',
    aprobado: 'Aprobado',
    error: 'Error'
  };

  const CLASSES: Record<string, string> = {
    pendiente: 'bg-sys-offwhite text-sys-medio',
    generando: 'bg-sys-electrico/10 text-sys-electrico',
    borrador: 'bg-sys-naranja/10 text-sys-naranja',
    aprobado: 'bg-sys-verde/10 text-sys-verde',
    error: 'bg-sys-rojo/10 text-sys-rojo'
  };
</script>

<span
  data-testid="report-status-badge"
  class="inline-flex items-center rounded-sys px-2 py-0.5 text-xs font-semibold {CLASSES[status] ??
    'bg-sys-offwhite text-sys-medio'}"
>
  {LABELS[status] ?? status}
</span>
