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
    <div class="flex justify-between text-xs text-slate-600">
      <span>Progreso</span>
      <span>{progressPct}%</span>
    </div>
    <div class="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
      <div
        class="h-full bg-[var(--sys-primary)] transition-all duration-300"
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
        class="min-h-[var(--sys-touch-min)] shrink-0 rounded-[var(--sys-radius)] border px-3 py-2 text-sm font-medium lg:w-full lg:text-left
          {section.id === activeSectionId
          ? 'border-[var(--sys-primary)] bg-[var(--sys-primary)] text-white'
          : 'border-slate-300 bg-white text-slate-700'}"
        onclick={() => onselect?.(section.id)}
      >
        {section.code} — {section.title}
      </button>
    {/each}
  </nav>
</div>
