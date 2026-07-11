<script lang="ts">
  import { Globe, MessageCircle, Settings } from 'lucide-svelte';
  import { uiStore, type TabId } from '$lib/stores/ui.svelte';

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
    background: var(--glass-bg);
    backdrop-filter: blur(24px) saturate(200%);
    -webkit-backdrop-filter: blur(24px) saturate(200%);
    border-top: 1px solid var(--border-subtle);
    box-shadow: 0 -2px 16px rgba(0, 0, 0, 0.04);
  }

  .nav-pill-track {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--input-bg);
    border: 1px solid var(--border-subtle);
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
</style>