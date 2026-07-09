<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';

  interface Props {
    messagesContainer?: HTMLDivElement;
    threshold?: number;
  }

  let { messagesContainer = undefined, threshold = 200 }: Props = $props();

  let isScrolledUp = $state(false);

  $effect(() => {
    const container = messagesContainer;
    if (!container) return;

    function onScroll() {
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      isScrolledUp = distanceFromBottom > threshold;
    }

    // Check initial state
    onScroll();

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
    };
  });

  function scrollToBottom() {
    if (!messagesContainer) return;
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth',
    });
  }
</script>

{#if isScrolledUp}
  <button
    class="fab animate-fade-in transition-spring"
    onclick={scrollToBottom}
    aria-label="Scroll to bottom"
  >
    <ChevronDown size={20} />
  </button>
{/if}

<style>
  .fab {
    position: absolute;
    bottom: 16px;
    right: 16px;
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    z-index: 10;

    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
    color: var(--text-secondary);

    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1),
                opacity 200ms cubic-bezier(0.4, 0, 0.2, 1),
                background 150ms ease,
                color 150ms ease;
  }

  .fab:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
    transform: scale(1.08);
  }

  .fab:active {
    transform: scale(0.95);
  }
</style>