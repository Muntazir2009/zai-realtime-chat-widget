<script lang="ts">
  import { Globe, MessageCircle, Settings } from 'lucide-svelte';
  import { uiStore, type TabId } from '$lib/stores/ui.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';

  let totalUnread = $derived(
    chatStore.sortedInbox.reduce((sum, entry) => sum + (entry.userChat.uc ?? 0), 0)
  );

  const tabs: { id: TabId; label: string; icon: typeof Globe }[] = [
    { id: 'global', label: 'Global', icon: Globe },
    { id: 'dms', label: 'Chats', icon: MessageCircle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  function selectTab(id: TabId) {
    uiStore.setTab(id);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<nav
  class="nav-bar"
  role="tablist"
  aria-label="Main navigation"
>
  <div class="nav-pill-track">
    {#each tabs as tab (tab.id)}
      {@const isActive = uiStore.tab === tab.id}
      <button
        class="nav-pill"
        class:nav-pill-active={isActive}
        role="tab"
        aria-selected={isActive}
        aria-label={tab.label}
        onclick={() => selectTab(tab.id)}
      >
        <tab.icon size={18} class="nav-pill-icon" />
        <span class="nav-pill-label">{tab.label}</span>
        {#if tab.id === 'dms' && totalUnread > 0}
          <span class="unread-badge">{totalUnread > 9 ? '9+' : totalUnread}</span>
        {/if}
      </button>
    {/each}
  </div>
</nav>

<style>
  .nav-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 16px;
    padding-bottom: max(6px, env(safe-area-inset-bottom, 0px) + 4px);
    background: transparent;
    border-top: none;
    box-shadow: none;
  }

  .nav-pill-track {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: blur(40px) saturate(220%);
    -webkit-backdrop-filter: blur(40px) saturate(220%);
    border: 0.5px solid rgba(255, 255, 255, 0.35);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 0.5px 0 rgba(255, 255, 255, 0.2) inset;
    will-change: transform;
  }

  .nav-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 42px;
    min-width: 80px;
    padding: 6px 16px;
    border-radius: var(--radius-pill);
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
    position: relative;
    user-select: none;
  }

  .nav-pill:active {
    transform: scale(0.92);
  }

  .nav-pill-label {
    white-space: nowrap;
    line-height: 1;
  }

  .nav-pill-icon {
    transition: transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .nav-pill-active {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    box-shadow: 0 2px 12px color-mix(in srgb, var(--color-primary) 35%, transparent);
    animation: navPillBounce 350ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .nav-pill-active .nav-pill-icon {
    transform: scale(1.1);
  }

  @keyframes navPillBounce {
    0% {
      transform: scale(0.88);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.06);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .unread-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-primary);
    color: white;
    font-size: 10px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    animation: badgeScaleIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    pointer-events: none;
  }

  @keyframes badgeScaleIn {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  :global(.dark) .nav-pill-track,
  :global(.amoled) .nav-pill-track,
  :global(.crimson-dark) .nav-pill-track {
    background: rgba(22, 27, 34, 0.55);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2), 0 0.5px 0 rgba(255, 255, 255, 0.05) inset;
  }
</style>