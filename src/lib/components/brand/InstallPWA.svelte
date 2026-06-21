<script lang="ts">
  import { onMount } from 'svelte';

  const DISMISS_KEY = 'sys-pwa-install-dismissed';

  let visible = $state(false);
  let platform = $state<'ios' | 'android' | null>(null);
  let deferredPrompt = $state<Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);

  onMount(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isStandalone = ('standalone' in navigator && (navigator as Navigator & { standalone: boolean }).standalone) ||
      window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS && !isStandalone) {
      platform = 'ios';
      visible = true;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as typeof deferredPrompt;
      platform = 'android';
      visible = true;
    });
  });

  function dismiss() {
    visible = false;
    sessionStorage.setItem(DISMISS_KEY, '1');
  }

  async function installAndroid() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    deferredPrompt = null;
  }
</script>

{#if visible}
  <div
    class="fixed bottom-0 left-0 right-0 z-50 safe-bottom"
    style="padding-bottom: env(safe-area-inset-bottom)"
    role="banner"
    aria-label="Instalar aplicación"
  >
    <div class="mx-auto max-w-lg px-4 pb-4">
      <div
        class="flex items-start gap-3 rounded-sys-app border border-[var(--sys-border-subtle)] bg-sys-blanco p-4"
        style="box-shadow: var(--sys-shadow-card)"
      >
        <img src="/icons/icon-192.png" alt="SyS Audit" class="h-11 w-11 shrink-0 rounded-xl" />
        <div class="min-w-0 flex-1">
          {#if platform === 'ios'}
            <p class="text-sm font-semibold text-sys-profundo">Instalá en tu iPhone</p>
            <p class="mt-0.5 text-xs text-[var(--sys-text-muted-light)]">
              Tocá
              <span class="inline-flex items-center gap-0.5 font-medium text-sys-profundo">
                <svg class="inline h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Compartir
              </span>
              → <strong>Agregar a inicio</strong>
            </p>
          {:else}
            <p class="text-sm font-semibold text-sys-profundo">Instalá la app</p>
            <p class="mt-0.5 text-xs text-[var(--sys-text-muted-light)]">
              Acceso directo sin navegador, funciona offline
            </p>
          {/if}
          <div class="mt-3 flex items-center gap-2">
            {#if platform === 'android'}
              <button
                onclick={installAndroid}
                class="rounded-sys bg-sys-electrico px-3 py-1.5 text-xs font-semibold text-white"
              >
                Instalar
              </button>
            {/if}
            <button
              onclick={dismiss}
              class="rounded-sys px-3 py-1.5 text-xs font-medium text-[var(--sys-text-muted-light)] hover:text-sys-profundo"
            >
              Ahora no
            </button>
          </div>
        </div>
        <button
          onclick={dismiss}
          aria-label="Cerrar"
          class="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--sys-text-muted-light)] hover:bg-sys-offwhite"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </div>
{/if}
