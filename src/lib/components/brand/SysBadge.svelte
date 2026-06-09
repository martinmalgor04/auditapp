<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';
  import {
    getAuditStatusBadgeClasses,
    getSysBadgeClasses,
    type SysBadgeVariant
  } from '$lib/brand/badge-variants';

  let {
    variant,
    status,
    label,
    class: className = '',
    children
  }: {
    variant?: SysBadgeVariant;
    status?: AuditStatus;
    label?: string;
    class?: string;
    children?: import('svelte').Snippet;
  } = $props();

  const classes = $derived.by(() => {
    if (status) return getAuditStatusBadgeClasses(status);
    if (variant) return getSysBadgeClasses(variant);
    return getSysBadgeClasses('neutral');
  });
</script>

<span class="{classes} {className}" data-sys-badge={variant ?? status}>
  {#if label}
    {label}
  {:else}
    {@render children?.()}
  {/if}
</span>
