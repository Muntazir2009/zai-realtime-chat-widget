<script lang="ts">
  import type { Message } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import DeliveryStatus from '$lib/components/indicators/DeliveryStatus.svelte';
  import AudioPlayer from '$lib/components/media/AudioPlayer.svelte';
  import { SmilePlus, Reply as ReplyIcon, Pencil } from 'lucide-svelte';

  interface Props {
    msg: Message;
    isOwn: boolean;
    showAvatar?: boolean;
    senderName?: string;
    isGrouped?: boolean;
    isPinned?: boolean;
    isStarred?: boolean;
    replyPreviewMsg?: Message | null;
    onReply?: (msg: Message) => void;
    onLongPress?: (msg: Message) => void;
    onImageTap?: (imageUrl: string, caption?: string) => void;
    onReaction?: (msg: Message, emoji: string) => void;
    onSwipeReply?: (msg: Message) => void;
  }

  let {
    msg,
    isOwn,
    showAvatar = false,
    senderName,
    isGrouped = false,
    isPinned = false,
    isStarred = false,
    replyPreviewMsg,
    onReply,
    onLongPress,
    onImageTap,
    onReaction,
    onSwipeReply,
  }: Props = $props();

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let touchStartY = $state(0);
  let touchStartX = $state(0);
  let touchCurrentX = $state(0);
  let isSwiping = $state(false);
  let showReactions = $state(false);
  let lastTapTime = 0;
  let swipeTriggered = $state(false);
  const LONG_PRESS_MS = 500;
  const SWIPE_REPLY_THRESHOLD = 80;

  // Swipe-to-reply visual offset
  let swipeOffset = $derived(() => {
    if (!isSwiping) return 0;
    const dx = isOwn ? touchStartX - touchCurrentX : touchCurrentX - touchStartX;
    return Math.max(0, Math.min(dx, 120));
  });

  let swipeOpacity = $derived(Math.min(swipeOffset() / SWIPE_REPLY_THRESHOLD, 1));

  function handleReaction(emoji: string) {
    onReaction?.(msg, emoji);
    showReactions = false;
  }

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      onReaction?.(msg, '❤️');
    }
    lastTapTime = now;
  }

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchCurrentX = touchStartX;
    isSwiping = false;
    swipeTriggered = false;

    longPressTimer = setTimeout(() => {
      if (!isSwiping) {
        onLongPress?.(msg);
      }
    }, LONG_PRESS_MS);
  }

  function handleTouchMove(e: TouchEvent) {
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    touchCurrentX = cx;

    const dx = isOwn ? touchStartX - cx : cx - touchStartX;
    const dy = Math.abs(cy - touchStartY);

    // If moving mostly horizontally, it's a swipe
    if (dx > 15 && dy < 20) {
      isSwiping = true;
      if (longPressTimer) clearTimeout(longPressTimer);

      // Trigger reply when threshold reached
      if (dx >= SWIPE_REPLY_THRESHOLD && !swipeTriggered) {
        swipeTriggered = true;
      }
    } else if (dy > 10 && dx < 15) {
      // Vertical scroll — cancel long press
      if (longPressTimer) clearTimeout(longPressTimer);
    }
  }

  function handleTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (swipeTriggered && swipeOffset() >= SWIPE_REPLY_THRESHOLD) {
      onSwipeReply?.(msg);
    }

    isSwiping = false;
    touchCurrentX = touchStartX;
    swipeTriggered = false;
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    onLongPress?.(msg);
  }

  const timeStr = $derived(() => {
    const d = new Date(msg.ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const deliveryStatus = $derived<'sending' | 'sent' | 'delivered' | 'read'>(
    msg.rk && !msg.ts ? 'sending' : 'sent'
  );

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Detect URLs in text messages for link preview
  const urlMatch = $derived(() => {
    if (msg.t !== 'text') return null;
    const match = msg.c.match(/https?:\/\/[^\s<>"']+/i);
    return match ? match[0] : null;
  });

  const textWithoutUrl = $derived(() => {
    if (msg.t !== 'text' || !urlMatch()) return msg.c;
    return msg.c.replace(urlMatch()!, '').trim();
  });
</script>

<div
  class="group flex {isOwn ? 'justify-end' : 'justify-start'} {isGrouped ? 'mb-0.5' : 'mb-2'} px-3 {isPinned ? '' : 'animate-scale-in'} {isOwn ? 'pl-8' : 'pr-8'}"
  style="transform: translateX({isOwn ? -swipeOffset() : swipeOffset()}px); transition: {isSwiping ? 'none' : 'transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1)'};"
  role="article"
  aria-label="Message from {isOwn ? 'you' : senderName || 'unknown'}"
  oncontextmenu={handleContextMenu}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <!-- Swipe Reply Indicator (revealed behind the bubble) -->
  {#if isSwiping && swipeOffset() > 20}
    <div
      class="absolute {isOwn ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full animate-scale-in"
      style="
        opacity: {swipeOpacity};
        background: var(--color-primary);
        color: var(--color-primary-foreground);
        z-index: 5;
        {isOwn ? 'right: 12px;' : 'left: 12px;'}
      "
    >
      <ReplyIcon size={16} />
      <span class="text-xs font-medium">Reply</span>
    </div>
  {/if}

  <!-- Avatar for received messages -->
  {#if !isOwn && showAvatar}
    <div class="mr-2 self-end">
      <Avatar username={senderName || '?'} size="sm" />
    </div>
  {/if}

  <div class="flex flex-col {isOwn ? 'items-end' : 'items-start'} max-w-[80%] relative">
    <!-- Sender Name -->
    {#if !isOwn && senderName && showAvatar}
      <span class="text-xs mb-1 ml-1 font-medium" style="color: var(--color-primary);">
        {senderName}
      </span>
    {/if}

    <!-- Reply Preview Bar (inline in bubble) -->
    {#if msg.rid && replyPreviewMsg}
      <div
        class="mb-1 px-3 py-1.5 rounded-t-[var(--radius-lg)] text-xs max-w-full"
        style="
          background: {isOwn ? 'rgba(0,0,0,0.12)' : 'var(--bg-elevated)'};
          border-left: 2.5px solid var(--color-primary);
          color: {isOwn ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)'};
        "
      >
        <p class="font-semibold text-[11px] mb-0.5" style="color: {isOwn ? 'var(--color-primary-foreground)' : 'var(--color-primary)'};">
          {isOwn ? 'You' : senderName}
        </p>
        <p class="truncate opacity-80">
          {replyPreviewMsg.t === 'image' ? '📷 Photo' : replyPreviewMsg.c.slice(0, 60)}
        </p>
      </div>
    {:else if msg.rid}
      <div
        class="mb-1 px-3 py-1.5 rounded-t-[var(--radius-lg)] text-xs max-w-full truncate"
        style="
          background: {isOwn ? 'rgba(0,0,0,0.12)' : 'var(--bg-elevated)'};
          border-left: 2.5px solid var(--color-primary);
          color: {isOwn ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)'};
        "
      >
        <span class="opacity-70">↩ Reply</span>
      </div>
    {/if}

    <!-- Bubble -->
    <div
      class="px-3.5 py-2.5 relative {isPinned ? 'ring-1' : ''}"
      onclick={handleDoubleTap}
      role="button"
      tabindex="0"
      onkeydown={(e) => { if (e.key === 'Enter') handleDoubleTap(); }}
      style="
        background: {isOwn ? 'var(--color-sent)' : 'var(--color-received)'};
        color: {isOwn ? 'var(--color-sent-foreground)' : 'var(--color-received-foreground)'};
        border-radius: {isGrouped
          ? (isOwn ? 'var(--radius-sm) var(--radius-sm) 4px var(--radius-sm)' : 'var(--radius-sm) var(--radius-sm) var(--radius-sm) 4px')
          : (isOwn ? 'var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)' : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px')};
        {isPinned ? 'ring-color: var(--color-primary); ring-opacity: 0.3;' : ''}
      "
    >
      {#if msg.t === 'text'}
        <p class="text-[15px] break-words whitespace-pre-wrap leading-relaxed">{msg.c}</p>

        <!-- Link preview card -->
        {#if urlMatch()}
          <a
            href={urlMatch()!}
            target="_blank"
            rel="noopener noreferrer"
            class="block mt-2 p-2.5 rounded-[var(--radius-sm)] text-xs transition-all duration-150 active:scale-[0.98]"
            style="background: {isOwn ? 'rgba(0,0,0,0.1)' : 'var(--input-bg)'}; color: {isOwn ? 'rgba(255,255,255,0.9)' : 'var(--color-primary)'};"
          >
            <p class="truncate font-medium" style="color: {isOwn ? 'var(--color-primary-foreground)' : 'var(--text-primary)'};">
              {urlMatch()?.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 40)}
            </p>
            <p class="mt-0.5 opacity-70 truncate">{urlMatch()}</p>
          </a>
        {/if}
      {:else if msg.t === 'voice' && msg.mu}
        <AudioPlayer url={msg.mu} duration={(msg.md?.duration as number) || 0} />
      {:else if msg.t === 'image' && msg.mu}
        <img
          src={msg.mu}
          alt={msg.c || 'Shared image'}
          class="rounded-[var(--radius-sm)] max-w-full cursor-pointer transition-all duration-200 active:scale-[0.98]"
          loading="lazy"
          style="max-height: 240px; object-fit: cover;"
          onclick={() => onImageTap?.(msg.mu!, msg.c || undefined)}
          onkeydown={(e) => { if (e.key === 'Enter') onImageTap?.(msg.mu!, msg.c || undefined); }}
          tabindex="0"
          role="button"
        />
        {#if msg.c}
          <p class="text-[15px] break-words whitespace-pre-wrap mt-1.5">{msg.c}</p>
        {/if}
      {:else if msg.t === 'system'}
        <p class="text-sm italic opacity-70 text-center">{msg.c}</p>
      {/if}
    </div>

    <!-- Timestamp, Status, & Badges -->
    <div class="flex items-center gap-1.5 mt-0.5 px-1">
      {#if isPinned}
        <span class="text-[10px] font-medium" style="color: var(--color-primary);">📌 Pinned</span>
      {/if}
      {#if isStarred}
        <span class="text-[10px]">⭐</span>
      {/if}
      {#if isOwn}
        <DeliveryStatus status={deliveryStatus} />
      {/if}
      {#if msg.edited}
        <span class="text-[10px] italic" style="color: var(--text-tertiary);">edited</span>
      {/if}
      <span class="text-[11px]" style="color: var(--text-tertiary);">
        {timeStr()}
      </span>
    </div>

    <!-- Quick React Button -->
    <div class="flex justify-end mt-0.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150" style="min-height: 24px;">
      <button
        class="min-w-[28px] min-h-[28px] flex items-center justify-center rounded-full"
        style="color: var(--text-tertiary);"
        onclick={() => (showReactions = !showReactions)}
        aria-label="Quick react"
      >
        <SmilePlus size={14} />
      </button>
      {#if showReactions}
        <div class="flex items-center gap-0.5 ml-1 animate-scale-in">
          {#each ['❤️', '👍', '😂'] as emoji}
            <button
              class="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full text-base transition-all duration-150 hover:scale-125 active:scale-110"
              style="background: var(--glass-bg); backdrop-filter: var(--glass-blur); border: 1px solid var(--border-subtle);"
              onclick={(e) => { e.stopPropagation(); handleReaction(emoji); }}
              aria-label="React with {emoji}"
            >
              {emoji}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>