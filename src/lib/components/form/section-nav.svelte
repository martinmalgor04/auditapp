<script lang="ts">
  import type { FormSection } from '$lib/server/form/load-form';

  let {
    sections,
    activeSectionId,
    progressPct,
    onselect
  }: {
    sections: FormSection[];
    activeSectionId: string;
    progressPct: number;
    onselect?: (sectionId: string) => void;
  } = $props();
</script>

<div class="space-y-3" data-section-nav>
  <div class="space-y-1">
    <div class="flex justify-between text-xs text-[var(--sys-text-muted-light)]">
      <span>Progreso</span>
      <span>{progressPct}%</span>
    </div>
    <div class="h-2 w-full overflow-hidden rounded-full bg-sys-medio/10">
      <div
        class="h-full bg-sys-electrico transition-all duration-300"
        style="width: {progressPct}%"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      ></div>
    </div>
  </div>

  <nav class="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Secciones">
    {#each sections as section (section.id)}
      <button
        type="button"
        class="min-h-[var(--sys-touch-min)] shrink-0 rounded-sys-app border px-3 py-2 text-sm font-medium lg:w-full lg:text-left
          {section.id === activeSectionId
          ? 'border-sys-electrico bg-sys-electrico text-white'
          : 'border-sys-medio/20 bg-sys-blanco text-[var(--sys-text-body-light)] hover:border-sys-electrico'}"
        onclick={() => onselect?.(section.id)}
      >
        {section.code} — {section.title}
      </button>
    {/each}
  </nav>
</div>
