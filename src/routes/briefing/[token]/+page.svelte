<script lang="ts">
  import { enhance } from '$app/forms';
  import BriefingConfirm from '$lib/components/briefing/briefing-confirm.svelte';
  import BriefingHeader from '$lib/components/briefing/briefing-header.svelte';
  import BriefingUnavailable from '$lib/components/briefing/briefing-unavailable.svelte';
  import BriefingWizard from '$lib/components/briefing/briefing-wizard.svelte';
  import SaveIndicator, { type SaveState } from '$lib/components/briefing/save-indicator.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let saveState = $state<SaveState>('idle');
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async function saveField(itemId: string, value: unknown) {
    if (!data.available) return;

    const immediateTypes = new Set(['bool', 'tri', 'select']);
    const item = data.items.find((i) => i.id === itemId);
    const delay = item && immediateTypes.has(item.fieldType) ? 0 : 600;

    const existing = debounceTimers.get(itemId);
    if (existing) clearTimeout(existing);

    const run = async () => {
      saveState = 'saving';
      try {
        const res = await fetch(`/api/briefing/${data.token}/responses`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, value, na: false })
        });
        if (!res.ok) {
          saveState = 'error';
          return;
        }
        saveState = 'saved';
        setTimeout(() => {
          if (saveState === 'saved') saveState = 'idle';
        }, 2000);
      } catch {
        saveState = 'error';
        setTimeout(async () => {
          try {
            await fetch(`/api/briefing/${data.token}/responses`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemId, value, na: false })
            });
            saveState = 'saved';
          } catch {
            saveState = 'error';
          }
        }, 2000);
      }
    };

    if (delay === 0) {
      await run();
    } else {
      debounceTimers.set(itemId, setTimeout(() => void run(), delay));
    }
  }
</script>

<svelte:head>
  <title>Briefing — Servicios y Sistemas</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

{#if !data.available}
  <BriefingUnavailable message={data.message} />
{:else if form?.success}
  <BriefingConfirm />
{:else}
  <div class="space-y-6">
    <BriefingHeader razonSocial={data.client.razonSocial} />
    <BriefingWizard
      items={data.items}
      stepCount={data.stepCount}
      onfieldchange={(itemId, value) => void saveField(itemId, value)}
    />
    <SaveIndicator state={saveState} />
    <form method="POST" action="?/submit" use:enhance class="sticky bottom-4 pt-2">
      <button
        type="submit"
        class="w-full min-h-[var(--sys-touch-min)] rounded-[var(--sys-radius)] bg-[var(--sys-primary)] text-white font-semibold text-base shadow-md hover:bg-[var(--sys-primary-dark)]"
      >
        Enviar
      </button>
    </form>
  </div>
{/if}
