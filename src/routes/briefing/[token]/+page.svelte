<script lang="ts">
  import { enhance } from '$app/forms';
  import BriefingConfirm from '$lib/components/briefing/briefing-confirm.svelte';
  import BriefingHeader from '$lib/components/briefing/briefing-header.svelte';
  import BriefingUnavailable from '$lib/components/briefing/briefing-unavailable.svelte';
  import BriefingWizard from '$lib/components/briefing/briefing-wizard.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import SaveIndicator, { type SaveState } from '$lib/components/briefing/save-indicator.svelte';
  import { createBriefingAutosave } from '$lib/client/briefing/autosave';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let saveState = $state<SaveState>('idle');

  const fieldTypes = $derived(
    data.available ? new Map(data.items.map((item) => [item.id, item.fieldType])) : new Map()
  );

  const briefingAutosave = createBriefingAutosave(data.available ? data.token : '', {
    onStateChange: (state) => {
      saveState = state;
    }
  });

  function saveField(itemId: string, value: unknown) {
    if (!data.available) return;
    const fieldType = fieldTypes.get(itemId) ?? 'text';
    briefingAutosave.scheduleSave(itemId, value, fieldType);
  }

  async function flushPendingSaves() {
    if (!data.available) return;
    await briefingAutosave.flushPending();
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
    <BriefingHeader razonSocial={data.client.razonSocial} refCode={data.client.refCode} />
    <BriefingWizard
      items={data.items}
      stepCount={data.stepCount}
      onbeforestepchange={flushPendingSaves}
      onfieldchange={(itemId, value) => saveField(itemId, value)}
    />
    <SaveIndicator state={saveState} />
    <form
      method="POST"
      action="?/submit"
      use:enhance={() => {
        return async () => {
          await flushPendingSaves();
        };
      }}
      class="sticky bottom-4 pt-2"
    >
      <SysButton type="submit" variant="primary" class="w-full text-base shadow-md">Enviar</SysButton>
    </form>
  </div>
{/if}
