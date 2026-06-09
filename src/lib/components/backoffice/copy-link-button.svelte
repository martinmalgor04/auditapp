<script lang="ts">
  let { url, label = 'Copiar link' }: { url: string; label?: string } = $props();

  let copied = $state(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // fallback silencioso
    }
  }
</script>

<button
  type="button"
  data-testid="copy-briefing-link"
  data-url={url}
  onclick={copyLink}
  class="text-xs text-blue-700 hover:text-blue-900 underline"
>
  {copied ? 'Copiado' : label}
</button>
