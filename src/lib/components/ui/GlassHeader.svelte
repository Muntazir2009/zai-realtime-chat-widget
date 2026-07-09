<script lang="ts">
  import { ChevronLeft } from 'lucide-svelte';

  interface Props {
    title: string;
    onBack?: () => void;
    rightAction?: { icon: string; label: string; onClick: () => void };
    transparent?: boolean;
  }

  let { title, onBack, rightAction, transparent = false }: Props = $props();

  function handleBack() {
    onBack?.();
  }
</script>

<header
  class="fixed top-0 left-0 right-0 z-50 glass-header safe-top"
  style="height: calc(56px + env(safe-area-inset-top, 0px));"
>
  <div class="flex items-center justify-between h-[56px] px-2">
    <!-- Back Button -->
    {#if onBack}
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-95"
        style="color: var(--color-primary);"
        onclick={handleBack}
        aria-label="Go back"
      >
        <ChevronLeft size={24} />
      </button>
    {:else}
      <div class="min-w-[44px]"></div>
    {/if}

    <!-- Title -->
    <h1 class="font-semibold text-base truncate max-w-[50%] text-center" style="color: var(--text-primary);">
      {title}
    </h1>

    <!-- Right Action -->
    {#if rightAction}
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-95"
        style="color: var(--text-secondary);"
        onclick={rightAction.onClick}
        aria-label={rightAction.label}
      >
        {@render IconFallback(rightAction.icon)}
      </button>
    {:else}
      <div class="min-w-[44px]"></div>
    {/if}
  </div>
</header>

{#snippet IconFallback(iconName: string)}
  <!-- Fallback: use a generic circle icon if dynamic import isn't available -->
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="1"></circle>
    <circle cx="19" cy="12" r="1"></circle>
    <circle cx="5" cy="12" r="1"></circle>
  </svg>
{/snippet}