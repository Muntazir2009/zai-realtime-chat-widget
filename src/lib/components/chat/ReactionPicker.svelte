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

  let pickerEl: HTMLDivElement | undefined;
  let ready = $state(false);
  let pickerStyle = $state<Record<string, string>>({});
  let showAbove = $state(true);

  const EMOJIS = ['❤️', '🔥', '😂', '😍', '👍', '😮', '😢', '🙏', '💀', '🥺', '🎉', '✨', '😤', '💯', '🫶', '🤝'];

  $effect(() => {
    if (open) {
      ready = false;
      requestAnimationFrame(() => {
        positionPicker();
        setTimeout(() => { ready = true; }, 25);
      });
    } else {
      ready = false;
    }
  });

  function positionPicker() {
    if (!pickerEl) return;
    const rect = pickerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;
    const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0');
    const gap = 10;

    // Horizontal: center on touch/click point, clamp to viewport
    let left = x - rect.width / 2;
    left = Math.max(pad, Math.min(left, vw - rect.width - pad));

    // Vertical: try above the point first, then below
    const spaceAbove = y - gap - rect.height;
    const spaceBelow = vh - y - gap - safeBottom;
    let top: number;
    let above: boolean;

    if (spaceAbove >= rect.height) {
      top = y - rect.height - gap;
      above = true;
    } else if (spaceBelow >= rect.height) {
      top = y + gap;
      above = false;
    } else if (spaceAbove > spaceBelow) {
      top = Math.max(pad, spaceAbove + y - rect.height - gap);
      above = true;
    } else {
      top = Math.min(vh - pad - safeBottom - rect.height, y + gap);
      above = false;
    }

    showAbove = above;

    // Compute caret position
    const caretCenter = x;
    const pickerCenter = left + rect.width / 2;
    const caretLeft = Math.max(20, Math.min(caretCenter - left, rect.width - 20));

    pickerStyle = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      '--caret-left': `${caretLeft}px`,
      zIndex: '103',
    };
  }

  function handleSelect(emoji: string) {
    if (!msg) return;
    onReact(emoji);
    onClose();
  }
</script>

{#if open}
  <div class="rxn-backdrop" onclick={onClose}></div>
  <div
    class="rxn-picker {ready ? 'rxn-picker-visible' : ''}"
    style={Object.entries(pickerStyle).map(([k, v]) => `${k}: ${v}`).join('; ')}
    bind:this={pickerEl}
    role="dialog"
    aria-label="Pick a reaction"
  >
    <div class="rxn-caret" class:rxn-caret-below={!showAbove}></div>
    {#each EMOJIS as emoji}
      <button
        class="rxn-btn {existingReactions.includes(emoji) ? 'rxn-btn-active' : ''}"
        onclick={() => handleSelect(emoji)}
        aria-label={`React with ${emoji}`}
      >
        {emoji}
      </button>
    {/each}
  </div>
{/if}

<style>
  .rxn-backdrop {
    position: fixed;
    inset: 0;
    z-index: 102;
  }

  .rxn-picker {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    padding: 10px 12px;
    border-radius: 26px;
    background: var(--glass-bg, rgba(255, 255, 255, 0.82));
    backdrop-filter: blur(28px) saturate(200%);
    -webkit-backdrop-filter: blur(28px) saturate(200%);
    border: var(--glass-border, 1px solid rgba(5, 150, 105, 0.08));
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.14),
      0 4px 12px rgba(0, 0, 0, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
    opacity: 0;
    transform: scale(0.85) translateY(8px);
    transition: opacity 150ms ease, transform 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
    pointer-events: none;
    position: relative;
    width: max-content;
    will-change: transform, opacity;
  }

  .rxn-picker-visible {
    opacity: 1;
    transform: scale(1) translateY(0);
    pointer-events: auto;
  }

  .rxn-caret {
    position: absolute;
    left: var(--caret-left, 50%);
    bottom: -8px;
    width: 16px;
    height: 10px;
    overflow: hidden;
    pointer-events: none;
    transform: translateX(-50%);
  }

  .rxn-caret::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    background: var(--glass-bg, rgba(255, 255, 255, 0.82));
    border: 1px solid var(--glass-border, 1px solid rgba(5, 150, 105, 0.08));
    border-top: none;
    border-left: none;
    left: 2px;
    top: 0;
    transform: rotate(45deg);
    transform-origin: top left;
  }

  .rxn-caret-below {
    bottom: auto;
    top: -8px;
  }

  .rxn-caret-below::after {
    top: auto;
    bottom: 0;
    transform-origin: bottom left;
    transform: rotate(-135deg);
  }

  .rxn-btn {
    width: 44px;
    height: 44px;
    font-size: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
    position: relative;
  }

  .rxn-btn:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    transform: scale(1.1);
  }

  .rxn-btn:active {
    transform: scale(0.72);
  }

  .rxn-btn-active {
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  }

  .rxn-btn-active::after {
    content: '';
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-primary) 40%, transparent);
  }
</style>