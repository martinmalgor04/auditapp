<script lang="ts">
  export let label: string;
  export let active: boolean = false;
  export let variant: 'default' | 'blue' | 'green' | 'gray' = 'default';
  export let onClick: () => void = () => {};

  $: variantClasses = active
    ? 'bg-[--sys-primary] text-white'
    : variant === 'blue'
      ? 'bg-[--sys-status-blue-bg] text-[--sys-status-blue-text]'
      : variant === 'green'
        ? 'bg-green-100 text-green-700'
        : variant === 'gray'
          ? 'bg-gray-100 text-gray-600'
          : 'bg-[--sys-bg-app] border border-[--sys-border] text-[--sys-text-secondary]';
</script>

<span
  class="rounded-full px-3 py-1 text-sm font-medium cursor-pointer {variantClasses}"
  on:click={onClick}
  role="button"
  tabindex="0"
  on:keydown={(e) => e.key === 'Enter' && onClick()}
>
  {label}
</span>
