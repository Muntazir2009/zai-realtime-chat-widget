<script lang="ts">
  import type { Message } from '$lib/types/index';
  import { Reply, Copy, Trash2, Pin, Star, Pencil, SmilePlus } from 'lucide-svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    msg: Message | null;
    isOwn: boolean;
    isPinned?: boolean;
    isStarred?: boolean;
    x?: number;
    y?: number;
    onReply: (msg: Message) => void;
    onCopy: (text: string) => void;
    onDelete: (msg: Message) => void;
    onPin?: (msg: Message) => void;
    onStar?: (msg: Message) => void;
    onEdit?: (msg: Message) => void;
    onReact?: (msg: Message) => void;
  }

  let {
    open, onClose, msg, isOwn, isPinned = false, isStarred = false, x = 0, y = 0,
    onReply, onCopy, onDelete, onPin, onStar, onEdit, onReact,
  }: Props = $props();

  let menuEl = $state<HTMLDivElement | null>(null);
  let positioned = $state(false);
  let guardActive = $state(false);

  // Position the menu once it's in the DOM
  $effect(() => {
    if (!open || !menuEl) {
      positioned = false;
      return;
    }

    // Wait one frame for layout, then position
    requestAnimationFrame(() => {
      if (!menuEl) return;
      const rect = menuEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 12;
      const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0');

      let left = x - rect.width / 2;
      let top = y - rect.height - 12;

      left = Math.max(pad, Math.min(left, vw - rect.width - pad));

      if (top < pad) {
        top = y + 12;
      }

      if (top + rect.height > vh - safeBottom - pad) {
        top = Math.max(pad, vh - safeBottom - pad - rect.height);
      }

      menuEl.style.top = `${top}px`;
      menuEl.style.left = `${left}px`;
      positioned = true;
    });
  });

  // Close on outside click — use mousedown (not pointerdown) to avoid interfering with touch
  $effect(() => {
    if (!open) return;

    // Guard: ignore outside clicks for 150ms after opening so the opening
    // gesture (long-press → pointerup/mouseup/touchend) doesn't instantly close the menu.
    guardActive = true;
    const guardTimer = setTimeout(() => { guardActive = false; }, 150);

    function handleClickOutside(e: MouseEvent) {
      if (guardActive) return;
      if (!menuEl) return;
      if (!menuEl.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    // Use mousedown in capture phase — fires before click, gives us a chance to close
    // before any other click handler runs. We intentionally do NOT call preventDefault()
    // so that the normal click event still fires on the target.
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchend', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(guardTimer);
      guardActive = false;
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchend', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  });

  function handleReply(e: MouseEvent) { e.stopPropagation(); if (!msg) return; onReply(msg); onClose(); }
  function handleCopy(e: MouseEvent) { e.stopPropagation(); if (!msg) return; onCopy(msg.c); onClose(); }
  function handleDelete(e: MouseEvent) { e.stopPropagation(); if (!msg) return; onDelete(msg); onClose(); }
  function handlePin(e: MouseEvent) { e.stopPropagation(); if (!msg) return; onPin?.(msg); onClose(); }
  function handleStar(e: MouseEvent) { e.stopPropagation(); if (!msg) return; onStar?.(msg); onClose(); }
  function handleEdit(e: MouseEvent) { e.stopPropagation(); if (!msg) return; onEdit?.(msg); onClose(); }
  function handleReact(e: MouseEvent) { e.stopPropagation(); if (!msg) return; onReact?.(msg); onClose(); }
</script>

{#if open}
  <div
    class="ctx-menu"
    class:ctx-menu-visible={positioned}
    class:ctx-menu-locked={guardActive}
    style="position: fixed; z-index: 10000;"
    bind:this={menuEl}
    role="menu"
    tabindex="-1"
  >
    <button class="ctx-item" onclick={handleReply} role="menuitem">
      <Reply size={16} />
      <span>Reply</span>
    </button>

    {#if msg?.t === 'text'}
      <button class="ctx-item" onclick={handleCopy} role="menuitem">
        <Copy size={16} />
        <span>Copy</span>
      </button>
    {/if}

    <button
      class="ctx-item"
      style={isPinned ? 'color: var(--color-primary);' : ''}
      onclick={handlePin}
      role="menuitem"
    >
      <Pin size={16} />
      <span>{isPinned ? 'Unpin' : 'Pin'}</span>
    </button>

    <button
      class="ctx-item"
      style={isStarred ? 'color: var(--color-primary);' : ''}
      onclick={handleStar}
      role="menuitem"
    >
      <Star size={16} fill={isStarred ? 'var(--color-primary)' : 'none'} />
      <span>{isStarred ? 'Unstar' : 'Star'}</span>
    </button>

    {#if isOwn && msg?.t === 'text'}
      <button class="ctx-item" onclick={handleEdit} role="menuitem">
        <Pencil size={16} />
        <span>Edit</span>
      </button>
    {/if}

    <button class="ctx-item" onclick={handleReact} role="menuitem">
      <SmilePlus size={16} />
      <span>React</span>
    </button>

    <div class="ctx-divider"></div>

    <button class="ctx-item ctx-item-danger" onclick={handleDelete} role="menuitem">
      <Trash2 size={16} />
      <span>{isOwn ? 'Delete' : 'Delete for me'}</span>
    </button>
  </div>
{/if}

<style>
  .ctx-menu {
    display: flex;
    flex-direction: column;
    min-width: 180px;
    padding: 6px;
    border-radius: 16px;
    background: var(--glass-bg, rgba(255, 255, 255, 0.82));
    backdrop-filter: blur(28px) saturate(200%);
    -webkit-backdrop-filter: blur(28px) saturate(200%);
    border: 1px solid var(--glass-border, 1px solid rgba(5, 150, 105, 0.08));
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.12),
      0 4px 12px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 140ms ease, transform 280ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
    pointer-events: auto;
  }

  .ctx-menu-locked {
    pointer-events: none !important;
  }

  .ctx-menu-visible {
    opacity: 1;
    transform: scale(1);
  }

  .ctx-item {
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
    touch-action: manipulation;
  }

  .ctx-item:hover {
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }

  .ctx-item:active {
    transform: scale(0.96);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .ctx-item-danger {
    color: var(--color-danger, #ef4444);
  }

  .ctx-item-danger:hover {
    background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
  }

  .ctx-item-danger:active {
    background: color-mix(in srgb, var(--color-danger, #ef4444) 12%, transparent);
  }

  .ctx-divider {
    height: 1px;
    margin: 4px 8px;
    background: var(--border-subtle);
  }
</style>