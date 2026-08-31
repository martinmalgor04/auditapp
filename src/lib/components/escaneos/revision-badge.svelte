<script lang="ts">
  import type { DispositivoRevision } from '$lib/server/escaneos/schemas';
  import { REVISION_BADGE, REVISION_LABELS } from '$lib/escaneos/escaneo-view';

  let { revision }: { revision: DispositivoRevision } = $props();
</script>

<span
  class="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold {REVISION_BADGE[
    revision
  ]}"
  data-testid="revision-badge"
  data-revision={revision}
>
  {REVISION_LABELS[revision]}
</span>
