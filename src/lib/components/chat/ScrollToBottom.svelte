<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';

  interface Props {
    messagesContainer?: HTMLDivElement;
    threshold?: number;
  }

  let { messagesContainer = undefined, threshold = 200 }: Props = $props();
  let isScrolledUp = $state(false);
  let newMsgCount = $state(0);
  let prevScrollHeight = 0;

  $effect(() => {
    const container = messagesContainer;
    if (!container) return;

    function onScroll() {
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const dist = scrollHeight - scrollTop - clientHeight;
      const wasUp = isScrolledUp;
      isScrolledUp = dist > threshold;

      // Detect new content being added at bottom while scrolled up
      if (scrollHeight > prevScrollHeight + 50 && wasUp) {
        newMsgCount++;
      }
      prevScrollHeight = scrollHeight;
    }

    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  });

  function scrollToBottom() {
    if (!messagesContainer) return;
    newMsgCount = 0;
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
  }
</script>

{#if isScrolledUp}
  <button class="fab" onclick={scrollToBottom} aria-label="Scroll to bottom">
    <div class="fab-inner">
      <ChevronDown size={18} />
      {#if newMsgCount > 0}
        <span class="fab-badge">{newMsgCount > 9 ? '9+' : newMsgCount}</span>
      {/if}
    </div>
  </button>
{/if}

<style>
  .fab {
    position: absolute;
    bottom: 16px;
    right: 12px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    z-index: 10;
    padding: 0;
    background: var(--glass-bg);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border: var(--glass-border);
    box-shadow: 0 4px 20px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06);
    color: var(--text-secondary);
    animation: fabIn 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 200ms ease,
                background 150ms ease;
    min-width: 40px;
    min-height: 40px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .fab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.14); }
  .fab:active { transform: scale(0.92); }

  @keyframes fabIn {
    from { opacity: 0; transform: scale(0.7) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .fab-inner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fab-badge {
    position: absolute;
    top: -6px;
    right: -8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(220, 38, 38, 0.4);
    animation: badgePulse 2s ease-in-out infinite;
    line-height: 1;
  }
</style>