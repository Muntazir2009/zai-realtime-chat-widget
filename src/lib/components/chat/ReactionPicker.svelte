<script lang="ts">
  import type { Message } from '$lib/types/index';

  interface Props {
    open: boolean;
    onClose: () => void;
    msg: Message | null;
    x?: number;
    y?: number;
    existingReactions?: string[];
    onReact: (emoji: string) => void;
  }

  let {
    open, onClose, msg, x = 0, y = 0, existingReactions = [], onReact,
  }: Props = $props();

  let menuEl: HTMLDivElement | undefined;
  let ready = $state(false);
  let menuStyle = $state<Record<string, string>>({});

  const REACTIONS: { emoji: string; label: string }[] = [
    { emoji: '❤️', label: 'Heart' },
    { emoji: '🔥', label: 'Fire' },
    { emoji: '😂', label: 'Laugh' },
    { emoji: '😍', label: 'Love' },
    { emoji: '👍', label: 'Thumbs up' },
    { emoji: '😮', label: 'Wow' },
    { emoji: '😢', label: 'Sad' },
    { emoji: '🙏', label: 'Pray' },
    { emoji: '💀', label: 'Skull' },
    { emoji: '🥺', label: 'Pleading' },
    { emoji: '🎉', label: 'Party' },
    { emoji: '✨', label: 'Sparkles' },
    { emoji: '😤', label: 'Angry' },
    { emoji: '💯', label: 'Hundred' },
    { emoji: '🫶', label: 'Heart hands' },
    { emoji: '🤝', label: 'Handshake' },
  ];

  $effect(() => {
    if (open) {
      ready = false;
      requestAnimationFrame(() => {
        positionMenu();
        setTimeout(() => { ready = true; }, 20);
      });
    } else {
      ready = false;
    }
  });

  function positionMenu() {
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;
    const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0');

    let left = x - rect.width / 2;
    let top = y - rect.height - 12;

    // Clamp horizontal
    left = Math.max(pad, Math.min(left, vw - rect.width - pad));

    // If goes above viewport, place below
    if (top < pad) {
      top = y + 12;
    }

    // If goes below viewport, adjust
    if (top + rect.height > vh - safeBottom - pad) {
      top = Math.max(pad, vh - safeBottom - pad - rect.height);
    }

    menuStyle = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      zIndex: '10000',
    };
  }

  function handleSelect(e: MouseEvent, emoji: string) {
    e.stopPropagation();
    if (!msg) return;
    onReact(emoji);
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('rxn-backdrop')) {
      onClose();
    }
  }

  function handleMenuClick(e: MouseEvent) {
    e.stopPropagation();
  }
</script>

{#if open}
  <div class="rxn-backdrop" onclick={handleBackdropClick}></div>
  <div
    class="rxn-menu {ready ? 'rxn-menu-visible' : ''}"
    style={Object.entries(menuStyle).map(([k, v]) => `${k}: ${v}`).join('; ')}
    bind:this={menuEl}
    role="menu"
    onclick={handleMenuClick}
  >
    {#each REACTIONS as { emoji, label }}
      <button
        class="rxn-item {existingReactions.includes(emoji) ? 'rxn-item-active' : ''}"
        onclick={(e) => handleSelect(e, emoji)}
        role="menuitem"
      >
        <span class="rxn-emoji">{emoji}</span>
        <span class="rxn-label">{label}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .rxn-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
  }

  .rxn-menu {
    display: flex;
    flex-direction: column;
    min-width: 180px;
    max-height: 70vh;
    overflow-y: auto;
    padding: 6px;
    border-radius: 16px;
    background: var(--glass-bg, rgba(255, 255, 255, 0.82));
    backdrop-filter: blur(28px) saturate(200%);
    -webkit-backdrop-filter: blur(28px) saturate(200%);
    border: var(--glass-border, 1px solid rgba(5, 150, 105, 0.08));
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.12),
      0 4px 12px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 140ms ease, transform 280ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
    pointer-events: none;
    will-change: transform, opacity;
  }

  .rxn-menu-visible {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  .rxn-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 12px;
    min-height: 38px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans, inherit);
    border-radius: 10px;
    cursor: pointer;
    transition: background 120ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
    text-align: left;
  }

  .rxn-item:hover {
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }

  .rxn-item:active {
    transform: scale(0.96);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .rxn-item-active {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .rxn-item-active .rxn-label {
    color: var(--color-primary);
    font-weight: 600;
  }

  .rxn-emoji {
    font-size: 18px;
    line-height: 1;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  .rxn-label {
    line-height: 1;
  }
</style>