<script lang="ts">
  import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
  import HeaderMobile from '$lib/components/ui/HeaderMobile.svelte';
  import Sidebar from '$lib/components/ui/Sidebar.svelte';
  import BottomNav from '$lib/components/ui/BottomNav.svelte';
  import InstallPWA from '$lib/components/brand/InstallPWA.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const isFormRoute = $derived($page.url.pathname.includes('/form'));
  const showShellHeader = $derived(!isFormRoute);

  function pageMeta(pathname: string): { title: string; subtitle: string; showNew: boolean } {
    if (pathname.startsWith('/tablero') || pathname === '/') {
      return { title: 'Tablero', subtitle: 'Auditorías activas', showNew: true };
    }
    if (pathname.startsWith('/crm')) {
      return { title: 'CRM', subtitle: 'Clientes y contactos', showNew: false };
    }
    if (pathname.startsWith('/mercado')) {
      return { title: 'Mercado', subtitle: 'Estudio NEA', showNew: false };
    }
    if (pathname.startsWith('/usuarios')) {
      return { title: 'Usuarios', subtitle: 'Equipo SyS', showNew: false };
    }
    if (pathname.startsWith('/plantillas')) {
      return { title: 'Plantillas', subtitle: 'Formularios técnicos', showNew: false };
    }
    if (pathname.startsWith('/auditorias')) {
      return { title: 'Auditoría', subtitle: '', showNew: false };
    }
    return { title: 'auditapp', subtitle: '', showNew: false };
  }

  const meta = $derived(pageMeta($page.url.pathname));

  function handleNew() {
    void goto('/auditorias/new');
  }
</script>

<ProgressBar />

{#if data.user}
  <Sidebar user={{ name: data.user.name, role: data.user.role }} />

  <BottomNav user={{ role: data.user.role }} />
{/if}

<main
  class="min-h-screen bg-[--sys-bg-app] max-lg:pb-[var(--sys-mobile-nav-offset)] lg:pb-0 lg:pl-[220px]"
>
  {#if data.user && showShellHeader}
    <HeaderMobile
      title={meta.title}
      subtitle={meta.subtitle}
      user={{ name: data.user.name }}
      showNew={meta.showNew}
      onNew={handleNew}
    />
  {/if}

  <div class="mx-auto max-w-6xl px-4 max-lg:pb-3 lg:px-6 lg:py-6">
    {@render children?.()}
  </div>
</main>

<InstallPWA />
