<script lang="ts">
  import type { ChatMeta, UserChat, User } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import { Camera, BellOff, Bell, Trash2, Pin, MoreVertical } from 'lucide-svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';

  interface Props {
    chatId: string;
    chatMeta: ChatMeta | null;
    userChat: UserChat;
    otherUser: User | null;
    isActive: boolean;
    onclick?: (chatId: string) => void;
    onSwipeAction?: (chatId: string, action: string) => void;
  }

  let { chatId, chatMeta, userChat, otherUser, isActive = false, onclick, onSwipeAction }: Props = $props();
  let pressed = $state(false);

  // Swipe state
  let swipeStartX = 0;
  let swipeStartY = 0;
  let currentSwipeOffset = $state(0);
  let isSwiping = $state(false);
  let lastTouchX = 0;
  let lastTouchTime = 0;
  let velocityX = 0;
  let swipeSpringRaf: number | null = null;
  let currentSwipeOffsetRaw = 0;

  const SWIPE_THRESHOLD = 65;
  let swipeRevealed = $state(false);

  // Long press context menu
  let showContextMenu = $state(false);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  // Derived presence
  let isOnline = $derived.by(() => {
    if (!otherUser) return false;
    return chatStore.presence.get(otherUser.id)?.status === 'online';
  });

  let isMuted = $derived(userChat.muted ?? false);

  function handleTap() {
    if (swipeRevealed) {
      resetSwipe();
      return;
    }
    pressed = true;
    onclick?.(chatId);
    setTimeout(() => (pressed = false), 150);
  }

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Now';
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function lastMessagePreview(): string {
    if (!chatMeta) return 'Loading...';
    const lm = chatMeta.lm;
    if (!lm) return 'No messages yet';
    if (lm.startsWith('📷')) return '📷 Photo';
    if (lm.startsWith('🎙')) return '🎙 Voice message';
    return lm;
  }

  const hasMediaPreview = $derived((chatMeta?.lm?.startsWith('📷') ?? false) || (chatMeta?.lm?.startsWith('🎙') ?? false));

  // --- Swipe physics ---
  function cancelSwipeSpring() {
    if (swipeSpringRaf !== null) {
      cancelAnimationFrame(swipeSpringRaf);
      swipeSpringRaf = null;
    }
  }

  function swipeSpringBack() {
    cancelSwipeSpring();
    const step = (lastTime: number) => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.032);
      const stiffness = 200;
      const damping = 14;
      const force = -stiffness * currentSwipeOffsetRaw - damping * (currentSwipeOffsetRaw > 0 ? 1 : -1);
      velocityX += force * dt * 0.001;
      velocityX *= 0.88;
      currentSwipeOffsetRaw += velocityX;
      if (Math.abs(currentSwipeOffsetRaw) < 0.3 && Math.abs(velocityX) < 0.3) {
        currentSwipeOffsetRaw = 0;
        currentSwipeOffset = 0;
        swipeRevealed = false;
        swipeSpringRaf = null;
        return;
      }
      currentSwipeOffset = currentSwipeOffsetRaw;
      swipeSpringRaf = requestAnimationFrame(() => step(now));
    };
    velocityX = 0;
    swipeSpringRaf = requestAnimationFrame((t) => step(t));
  }

  function resetSwipe() {
    cancelSwipeSpring();
    currentSwipeOffsetRaw = 0;
    currentSwipeOffset = 0;
    swipeRevealed = false;
    isSwiping = false;
  }

  function handleTouchStart(e: TouchEvent) {
    cancelSwipeSpring();
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    lastTouchX = swipeStartX;
    lastTouchTime = Date.now();
    velocityX = 0;
    isSwiping = false;

    // Start long press timer
    longPressTimer = setTimeout(() => {
      if (!isSwiping) {
        showContextMenu = true;
      }
    }, 400);
  }

  function handleTouchMove(e: TouchEvent) {
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    const now = Date.now();
    const dt = now - lastTouchTime;
    if (dt > 0) velocityX = (cx - lastTouchX) / dt;
    lastTouchX = cx;
    lastTouchTime = now;

    const rawDx = swipeStartX - cx; // swipe left = positive
    const dy = Math.abs(cy - swipeStartY);

    if (rawDx > 10 && dy < rawDx * 0.6) {
      isSwiping = true;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      let effectiveDx: number;
      if (rawDx > SWIPE_THRESHOLD) {
        effectiveDx = SWIPE_THRESHOLD + (rawDx - SWIPE_THRESHOLD) * 0.2;
      } else {
        effectiveDx = rawDx * (0.6 + 0.4 * (rawDx / SWIPE_THRESHOLD));
      }
      currentSwipeOffsetRaw = effectiveDx;
      currentSwipeOffset = effectiveDx;
    } else if (dy > 10 && rawDx < 15) {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }
  }

  function handleTouchEnd() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

    if (currentSwipeOffsetRaw >= SWIPE_THRESHOLD * 0.7 || velocityX > 0.3) {
      // Reveal actions
      currentSwipeOffsetRaw = SWIPE_THRESHOLD;
      currentSwipeOffset = SWIPE_THRESHOLD;
      swipeRevealed = true;
    } else {
      swipeSpringBack();
    }
    isSwiping = false;
  }

  function handleAction(action: string) {
    onSwipeAction?.(chatId, action);
    resetSwipe();
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    showContextMenu = true;
  }
</script>

<div
  class="tile-wrapper"
  style="position: relative; overflow: hidden;"
>
  <!-- Swipe action buttons (behind the tile) -->
  <div class="tile-actions" style="transform: translateX({swipeRevealed ? '0' : '100%'}); transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);">
    <button
      class="tile-action-btn action-mute"
      onclick={() => handleAction('mute')}
      aria-label={isMuted ? 'Unmute' : 'Mute'}
    >
      {#if isMuted}
        <Bell size={16} />
      {:else}
        <BellOff size={16} />
      {/if}
    </button>
    <button
      class="tile-action-btn action-pin"
      onclick={() => handleAction('pin')}
      aria-label="Pin"
    >
      <Pin size={16} />
    </button>
    <button
      class="tile-action-btn action-delete"
      onclick={() => handleAction('delete')}
      aria-label="Delete"
    >
      <Trash2 size={16} />
    </button>
  </div>

  <!-- The tile itself -->
  <button
    class="tile"
    class:tile-active={isActive}
    style="
      min-height: 72px;
      transform: translateX({-currentSwipeOffset}px);
      transition: {isSwiping ? 'none' : 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease'};
    "
    onclick={handleTap}
    oncontextmenu={handleContextMenu}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    aria-label="Open chat with {otherUser?.displayName || 'Unknown'}"
  >
    <div class="tile-avatar-wrap">
      <Avatar
        username={otherUser?.username || '?'}
        size="md"
        avatarUrl={otherUser?.avatarUrl}
      />
      {#if isOnline}
        <span class="tile-online-dot"></span>
      {/if}
    </div>

    <div class="tile-content">
      <div class="tile-top">
        <span class="tile-name">
          {otherUser?.displayName || 'Unknown'}
          {#if isMuted}
            <BellOff size={11} class="tile-mute-icon" />
          {/if}
        </span>
        <span class="tile-time">{chatMeta?.ts ? formatTime(chatMeta.ts) : ''}</span>
      </div>
      <div class="tile-bottom">
        <p class="tile-preview">
          {#if hasMediaPreview}
            <Camera size={13} class="tile-preview-icon" />
          {/if}
          {lastMessagePreview()}
        </p>
        {#if userChat.uc > 0}
          <span class="tile-badge">
            {userChat.uc > 99 ? '99+' : userChat.uc}
          </span>
        {/if}
      </div>
    </div>
  </button>
</div>

<!-- Context menu (long press) -->
{#if showContextMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="tile-ctx-backdrop" onclick={() => (showContextMenu = false)} onkeydown={(e) => e.key === 'Escape' && (showContextMenu = false)}>
    <div class="tile-ctx-sheet" onclick={(e) => e.stopPropagation()}>
      <button class="tile-ctx-item" onclick={() => { handleAction('mute'); showContextMenu = false; }}>
        {#if isMuted}
          <Bell size={15} />
          <span>Unmute</span>
        {:else}
          <BellOff size={15} />
          <span>Mute</span>
        {/if}
      </button>
      <button class="tile-ctx-item" onclick={() => { handleAction('pin'); showContextMenu = false; }}>
        <Pin size={15} />
        <span>Pin</span>
      </button>
      <div class="tile-ctx-divider"></div>
      <button class="tile-ctx-item tile-ctx-danger" onclick={() => { handleAction('delete'); showContextMenu = false; }}>
        <Trash2 size={15} />
        <span>Delete chat</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .tile-wrapper {
    position: relative;
  }

  .tile-actions {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: stretch;
    z-index: 0;
  }

  .tile-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    min-width: 64px;
    padding: 0 8px;
    font-size: 13px;
    font-weight: 500;
    transition: transform 150ms ease, opacity 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .tile-action-btn:active { transform: scale(0.92); }

  .action-mute {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
  }
  .action-pin {
    background: #f59e0b;
    color: #1a1a1e;
  }
  .action-delete {
    background: #ef4444;
    color: #ffffff;
  }

  .tile {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    border: none;
    background: var(--bg-surface, transparent);
    cursor: pointer;
    text-align: left;
    position: relative;
    z-index: 1;
    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }

  .tile::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 72px;
    right: 16px;
    height: 1px;
    background: var(--border-subtle);
  }

  .tile:active { background: var(--input-bg); }
  .tile-active { background: var(--input-bg); }

  .tile-avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .tile-online-dot {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--bg-surface, #16161e);
    background: #22c55e;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
    animation: tileDotPulse 2s ease-in-out infinite;
  }

  @keyframes tileDotPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
    50% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0); }
  }

  .tile-content {
    flex: 1;
    min-width: 0;
    padding: 10px 0;
  }

  .tile-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .tile-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .tile-mute-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }

  .tile-time {
    font-size: 12px;
    color: var(--text-tertiary);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .tile-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 3px;
  }

  .tile-preview {
    font-size: 14px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .tile-preview-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  .tile-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 20px;
    min-height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, #7f1d1d));
    color: var(--color-primary-foreground);
    font-size: 11px;
    font-weight: 700;
    box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary) 35%, transparent);
    line-height: 1;
  }

  /* === CONTEXT MENU === */
  .tile-ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: var(--overlay-bg);
    animation: ctxFadeIn 150ms ease both;
  }

  .tile-ctx-sheet {
    position: absolute;
    bottom: 16px;
    left: 16px;
    right: 16px;
    max-width: 320px;
    margin: 0 auto;
    padding: 6px;
    border-radius: var(--radius-lg, 16px);
    background: rgba(30, 30, 40, 0.95);
    backdrop-filter: blur(24px) saturate(200%);
    -webkit-backdrop-filter: blur(24px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    animation: ctxScaleIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    z-index: 81;
  }

  .tile-ctx-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    min-height: 44px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    border-radius: var(--radius-md, 12px);
    cursor: pointer;
    transition: transform 150ms ease, background 150ms ease;
    -webkit-tap-highlight-color: transparent;
    text-align: left;
  }
  .tile-ctx-item:active { transform: scale(0.97); background: var(--input-bg); }
  .tile-ctx-danger { color: #ef4444; }

  .tile-ctx-divider {
    height: 1px;
    margin: 2px 8px;
    background: rgba(255, 255, 255, 0.06);
  }

  @keyframes ctxFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ctxScaleIn {
    from { opacity: 0; transform: scale(0.92) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
</style>