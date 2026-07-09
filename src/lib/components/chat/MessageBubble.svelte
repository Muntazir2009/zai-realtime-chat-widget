<script lang="ts">
  import type { Message } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import DeliveryStatus from '$lib/components/indicators/DeliveryStatus.svelte';
  import AudioPlayer from '$lib/components/media/AudioPlayer.svelte';
  import { Reply as ReplyIcon } from 'lucide-svelte';

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
    msg, isOwn, showAvatar = false, senderName, isGrouped = false,
    isPinned = false, isStarred = false, replyPreviewMsg,
    onReply, onLongPress, onImageTap, onReaction, onSwipeReply,
  }: Props = $props();

  // --- Swipe physics state ---
  let touchStartX = 0;
  let touchStartY = 0;
  let currentOffset = 0;
  let touchStartTime = 0;
  let lastTouchX = 0;
  let lastTouchTime = 0;
  let velocityX = 0;
  let isSwiping = $state(false);
  let swipeTriggered = $state(false);
  let displayOffset = $state(0);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let springRaf: number | null = null;
  let lastTapTime = 0;

  const SWIPE_THRESHOLD = 60;
  const ELASTIC_FACTOR = 0.3;
  const VELOCITY_THRESHOLD = 0.25;

  function springBack() {
    currentOffset *= 0.78;
    if (Math.abs(currentOffset) < 0.5) {
      currentOffset = 0;
      displayOffset = 0;
      springRaf = null;
      return;
    }
    displayOffset = currentOffset;
    springRaf = requestAnimationFrame(springBack);
  }

  function cancelSpring() {
    if (springRaf !== null) {
      cancelAnimationFrame(springRaf);
      springRaf = null;
    }
  }

  function handleTouchStart(e: TouchEvent) {
    cancelSpring();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    lastTouchX = touchStartX;
    touchStartTime = Date.now();
    lastTouchTime = Date.now();
    velocityX = 0;
    isSwiping = false;
    swipeTriggered = false;

    longPressTimer = setTimeout(() => {
      if (!isSwiping) onLongPress?.(msg);
    }, 500);
  }

  function handleTouchMove(e: TouchEvent) {
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    const now = Date.now();
    const dt = now - lastTouchTime;
    if (dt > 0) velocityX = (cx - lastTouchX) / dt;
    lastTouchX = cx;
    lastTouchTime = now;

    const rawDx = isOwn ? touchStartX - cx : cx - touchStartX;
    const dy = Math.abs(cy - touchStartY);

    if (rawDx > 12 && dy < rawDx * 0.6) {
      isSwiping = true;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      let effectiveDx: number;
      if (rawDx > SWIPE_THRESHOLD) {
        const beyond = rawDx - SWIPE_THRESHOLD;
        effectiveDx = SWIPE_THRESHOLD + beyond * ELASTIC_FACTOR;
      } else {
        effectiveDx = rawDx;
      }
      currentOffset = effectiveDx * (isOwn ? -1 : 1);
      displayOffset = currentOffset;

      if (rawDx >= SWIPE_THRESHOLD && !swipeTriggered) swipeTriggered = true;
    } else if (dy > 10 && rawDx < 15) {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }
  }

  function handleTouchEnd() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

    const shouldTrigger = swipeTriggered ||
      (Math.abs(currentOffset) >= SWIPE_THRESHOLD * 0.8 && Math.abs(velocityX) > VELOCITY_THRESHOLD);

    if (shouldTrigger) {
      onSwipeReply?.(msg);
      currentOffset = 0;
      displayOffset = 0;
    } else {
      springBack();
    }

    isSwiping = false;
    swipeTriggered = false;
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    onLongPress?.(msg);
  }

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTapTime < 300) onReaction?.(msg, '❤️');
    lastTapTime = now;
  }

  // --- Derived ---
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

  const urlMatch = $derived(() => {
    if (msg.t !== 'text') return null;
    const match = msg.c.match(/https?:\/\/[^\s<>"']+/i);
    return match ? match[0] : null;
  });

  const textWithoutUrl = $derived(() => {
    if (msg.t !== 'text' || !urlMatch()) return msg.c;
    return msg.c.replace(urlMatch()!, '').trim();
  });

  const replyIndicatorOpacity = $derived(Math.min(Math.abs(displayOffset) / SWIPE_THRESHOLD, 1));

  const bubbleRadius = $derived(
    isOwn
      ? (isGrouped ? '18px 18px 4px 18px' : '18px 18px 4px 18px')
      : (isGrouped ? '18px 18px 18px 4px' : '18px 18px 18px 4px')
  );
</script>

<div
  class="msg-row"
  style="
    justify-content: {isOwn ? 'flex-end' : 'flex-start'};
    margin-top: {isGrouped ? '2px' : '8px'};
    padding-left: {isOwn ? '48px' : '12px'};
    padding-right: {isOwn ? '12px' : '48px'};
    transform: translateX({displayOffset}px);
    transition: {isSwiping ? 'none' : 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)'};
  "
  role="article"
  aria-label="Message from {isOwn ? 'you' : senderName || 'unknown'}"
  oncontextmenu={handleContextMenu}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <!-- Swipe Reply Indicator -->
  {#if Math.abs(displayOffset) > 15}
    <div
      class="swipe-indicator"
      style="opacity: {replyIndicatorOpacity}; {isOwn ? 'right: 0px;' : 'left: 0px;'}"
    >
      <ReplyIcon size={15} />
    </div>
  {/if}

  <!-- Avatar -->
  {#if !isOwn && showAvatar}
    <div class="mr-2 self-end" style="margin-bottom: 18px;">
      <Avatar username={senderName || '?'} size="sm" />
    </div>
  {/if}

  <div class="msg-wrapper" style="align-items: {isOwn ? 'flex-end' : 'flex-start'};">
    <!-- Sender Name -->
    {#if !isOwn && senderName && showAvatar}
      <span class="msg-sender">{senderName}</span>
    {/if}

    <!-- Bubble -->
    <div
      class="msg-bubble {isOwn ? 'bbl-sent' : 'bbl-recv'}"
      style="border-radius: {bubbleRadius}; {isPinned ? 'box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 30%, transparent);' : ''}"
      onclick={handleDoubleTap}
      role="button"
      tabindex="0"
      onkeydown={(e) => { if (e.key === 'Enter') handleDoubleTap(); }}
    >
      <!-- Reply Preview -->
      {#if msg.rid}
        <div class="rply-bar" style="background: {isOwn ? 'rgba(0,0,0,0.1)' : 'var(--bg-elevated)'};">
          <div class="rply-accent"></div>
          <div class="rply-body">
            {#if replyPreviewMsg}
              <p class="rply-who" style="color: {isOwn ? 'var(--color-primary-foreground)' : 'var(--color-primary)'};">{isOwn ? 'You' : senderName}</p>
              <p class="rply-text">{replyPreviewMsg.t === 'image' ? '📷 Photo' : replyPreviewMsg.c.slice(0, 60)}</p>
            {:else}
              <p class="rply-text" style="opacity: 0.7;">↩ Reply</p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Content -->
      {#if msg.t === 'text'}
        <p class="bbl-text">{msg.c}</p>
        {#if urlMatch()}
          <a href={urlMatch()!} target="_blank" rel="noopener noreferrer" class="link-card" style="background: {isOwn ? 'rgba(0,0,0,0.08)' : 'var(--input-bg)'};">
            <p class="link-domain" style="color: var(--text-primary);">{urlMatch()?.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 40)}</p>
            <p class="link-url">{urlMatch()}</p>
          </a>
        {/if}
      {:else if msg.t === 'voice' && msg.mu}
        <AudioPlayer url={msg.mu} duration={(msg.md?.duration as number) || 0} />
      {:else if msg.t === 'image' && msg.mu}
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <img
          src={msg.mu}
          alt={msg.c || 'Shared image'}
          class="bbl-img"
          loading="lazy"
          onclick={(e) => { e.stopPropagation(); onImageTap?.(msg.mu!, msg.c || undefined); }}
        />
        {#if msg.c}
          <p class="bbl-text" style="margin-top: 6px;">{msg.c}</p>
        {/if}
      {:else if msg.t === 'system'}
        <p class="bbl-sys">{msg.c}</p>
      {/if}
    </div>

    <!-- Meta -->
    <div class="msg-meta">
      {#if isPinned}
        <span class="m-badge" style="color: var(--color-primary);">📌 Pinned</span>
      {/if}
      {#if isStarred}
        <span class="m-badge">⭐</span>
      {/if}
      {#if isOwn}
        <DeliveryStatus status={deliveryStatus} />
      {/if}
      {#if msg.edited}
        <span class="m-edited">edited</span>
      {/if}
      <span class="m-time">{timeStr()}</span>
    </div>
  </div>
</div>

<style>
  .msg-row {
    display: flex;
    position: relative;
    -webkit-user-select: none;
    user-select: none;
    will-change: transform;
  }

  .msg-wrapper {
    display: flex;
    flex-direction: column;
    max-width: 82%;
    min-width: 80px;
    position: relative;
  }

  .msg-sender {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
    margin-left: 2px;
    color: var(--color-primary);
  }

  /* === BUBBLE MATERIALS === */
  .msg-bubble {
    padding: 10px 14px;
    position: relative;
    overflow: hidden;
  }

  .bbl-sent {
    background: var(--color-sent);
    color: var(--color-sent-foreground);
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(5,150,105,0.08);
  }
  .bbl-sent::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 45%;
    background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%);
    border-radius: inherit;
    pointer-events: none;
  }

  .bbl-recv {
    background: var(--color-received);
    color: var(--color-received-foreground);
    box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.03);
    border: 1px solid var(--border-subtle);
  }

  /* === CONTENT === */
  .bbl-text {
    font-size: 15px;
    line-height: 1.45;
    word-break: break-word;
    white-space: pre-wrap;
    margin: 0;
  }

  .bbl-img {
    display: block;
    width: 100%;
    max-height: 280px;
    object-fit: cover;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 200ms ease;
  }
  .bbl-img:active { transform: scale(0.97); }

  .bbl-sys {
    font-size: 13px;
    font-style: italic;
    opacity: 0.7;
    text-align: center;
    margin: 0;
  }

  /* === REPLY PREVIEW === */
  .rply-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    overflow: hidden;
  }

  .rply-accent {
    width: 2.5px;
    border-radius: 2px;
    background: var(--color-primary);
    flex-shrink: 0;
  }

  .rply-body { min-width: 0; flex: 1; }

  .rply-who {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .rply-text {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.75;
    color: var(--text-secondary);
    margin: 0;
  }

  /* === LINK CARD === */
  .link-card {
    display: block;
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    text-decoration: none;
    transition: transform 150ms ease;
  }
  .link-card:active { transform: scale(0.98); }

  .link-domain {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  .link-url {
    font-size: 11px;
    margin-top: 2px;
    opacity: 0.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-primary);
  }

  /* === META === */
  .msg-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 3px;
    padding: 0 4px;
    min-height: 16px;
  }

  .m-time {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1;
  }

  .m-edited {
    font-size: 10px;
    font-style: italic;
    color: var(--text-tertiary);
  }

  .m-badge { font-size: 10px; line-height: 1; }

  /* === SWIPE INDICATOR === */
  .swipe-indicator {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 9999px;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: 12px;
    font-weight: 500;
    pointer-events: none;
    z-index: 5;
    transition: opacity 150ms ease;
    box-shadow: 0 4px 16px rgba(5, 150, 105, 0.3);
  }
</style>