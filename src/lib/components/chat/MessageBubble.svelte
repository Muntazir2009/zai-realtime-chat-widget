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
  let lastTouchX = 0;
  let lastTouchTime = 0;
  let velocityX = 0;
  let isSwiping = $state(false);
  let swipeTriggered = $state(false);
  let displayOffset = $state(0);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let springRaf: number | null = null;
  let lastTapTime = 0;
  let touchStartTime = 0;

  const SWIPE_THRESHOLD = 70;
  const ELASTIC_FACTOR = 0.25;
  const VELOCITY_THRESHOLD = 0.3;

  // Damped spring constants
  const SPRING_STIFFNESS = 180;
  const SPRING_DAMPING = 12;

  function springBack() {
    const step = (lastTime: number) => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.032);
      const force = -SPRING_STIFFNESS * currentOffset - SPRING_DAMPING * (currentOffset !== 0 ? 1 : 0) * (currentOffset > 0 ? 1 : -1);
      velocityX += force * dt * 0.001;
      velocityX *= 0.92;
      currentOffset += velocityX;
      if (Math.abs(currentOffset) < 0.3 && Math.abs(velocityX) < 0.3) {
        currentOffset = 0;
        displayOffset = 0;
        springRaf = null;
        return;
      }
      displayOffset = currentOffset;
      springRaf = requestAnimationFrame(() => step(now));
    };
    velocityX = 0;
    springRaf = requestAnimationFrame((t) => step(t));
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

    if (rawDx > 10 && dy < rawDx * 0.6) {
      isSwiping = true;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      let effectiveDx: number;
      if (rawDx > SWIPE_THRESHOLD) {
        const beyond = rawDx - SWIPE_THRESHOLD;
        effectiveDx = SWIPE_THRESHOLD + beyond * ELASTIC_FACTOR;
      } else {
        effectiveDx = rawDx * (0.6 + 0.4 * (rawDx / SWIPE_THRESHOLD));
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
      (Math.abs(currentOffset) >= SWIPE_THRESHOLD * 0.7 && Math.abs(velocityX) > VELOCITY_THRESHOLD);

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

  // Detect if message is emoji-only for larger display
  const isEmojiOnly = $derived(
    msg.t === 'text' && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]+$/u.test(msg.c.trim()) && msg.c.trim().length <= 8
  );
</script>

<div
  class="msg-row"
  class:msg-own={isOwn}
  class:msg-other={!isOwn}
  class:msg-grouped={isGrouped}
  style="transform: translateX({displayOffset}px); transition: {isSwiping ? 'none' : 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)'};"
  role="article"
  aria-label="Message from {isOwn ? 'you' : senderName || 'unknown'}"
  oncontextmenu={handleContextMenu}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <!-- Swipe Reply Indicator -->
  {#if Math.abs(displayOffset) > 12}
    <div
      class="swipe-indicator"
      style="opacity: {replyIndicatorOpacity}; {isOwn ? 'right: 0px;' : 'left: 0px;'}"
    >
      <ReplyIcon size={15} />
    </div>
  {/if}

  <!-- Avatar — aligned with bubble top -->
  {#if !isOwn && showAvatar}
    <div class="msg-avatar-col">
      <Avatar username={senderName || '?'} size="sm" />
    </div>
  {:else if !isOwn && !showAvatar}
    <!-- Spacer to keep alignment with avatar rows -->
    <div class="msg-avatar-spacer"></div>
  {/if}

  <!-- Sender Name (above bubble, aligned with avatar) -->
  {#if !isOwn && senderName && showAvatar}
    <span class="msg-sender">{senderName}</span>
  {/if}

  <!-- Bubble -->
  <div
    class="msg-bubble {isOwn ? 'bbl-sent' : 'bbl-recv'} {isGrouped ? 'bbl-grouped' : ''} {isPinned ? 'bbl-pinned' : ''} {isEmojiOnly ? 'bbl-emoji' : ''}"
    onclick={handleDoubleTap}
    role="button"
    tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter') handleDoubleTap(); }}
  >
    <!-- Reply Preview -->
    {#if msg.rid}
      <div class="rply-bar">
        <div class="rply-accent"></div>
        <div class="rply-body">
          {#if replyPreviewMsg}
            <p class="rply-who">{isOwn ? 'You' : (senderName || 'Unknown')}</p>
            <p class="rply-text">{replyPreviewMsg.t === 'image' ? '📷 Photo' : replyPreviewMsg.t === 'voice' ? '🎙 Voice' : replyPreviewMsg.c.slice(0, 60)}</p>
          {:else}
            <p class="rply-text rply-fallback">↩ Reply</p>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Content -->
    {#if msg.t === 'text'}
      <p class="bbl-text {isEmojiOnly ? 'bbl-emoji-text' : ''}">{msg.c}</p>
      {#if urlMatch()}
        <a href={urlMatch()!} target="_blank" rel="noopener noreferrer" class="link-card">
          <div class="link-icon-wrap">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </div>
          <div class="link-body">
            <p class="link-domain">{urlMatch()?.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 40)}</p>
          </div>
        </a>
      {/if}
    {:else if msg.t === 'voice' && msg.mu}
      <AudioPlayer url={msg.mu} duration={(msg.md?.duration as number) || 0} />
    {:else if msg.t === 'image' && msg.mu}
      <div class="bbl-img-wrap">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <img
          src={msg.mu}
          alt={msg.c || 'Shared image'}
          class="bbl-img"
          loading="lazy"
          onclick={(e) => { e.stopPropagation(); onImageTap?.(msg.mu!, msg.c || undefined); }}
        />
      </div>
      {#if msg.c}
        <p class="bbl-text bbl-caption">{msg.c}</p>
      {/if}
    {:else if msg.t === 'system'}
      <p class="bbl-sys">{msg.c}</p>
    {/if}

    <!-- Inline Meta (time + status inside bubble) -->
    <div class="bbl-meta">
      {#if isPinned}
        <span class="bbl-badge bbl-pinned-badge">📌</span>
      {/if}
      {#if isStarred}
        <span class="bbl-badge">⭐</span>
      {/if}
      {#if msg.edited}
        <span class="bbl-edited">edited</span>
      {/if}
      <span class="bbl-time">{timeStr()}</span>
      {#if isOwn}
        <DeliveryStatus status={deliveryStatus} />
      {/if}
    </div>
  </div>
</div>

<style>
  /* === ROW LAYOUT === */
  .msg-row {
    display: flex;
    position: relative;
    -webkit-user-select: none;
    user-select: none;
    will-change: transform;
    padding: 1px 0;
    align-items: flex-end;
  }

  .msg-own {
    justify-content: flex-end;
    padding-left: 64px;
    padding-right: 10px;
  }

  .msg-other {
    justify-content: flex-start;
    padding-left: 10px;
    padding-right: 64px;
  }

  .msg-grouped {
    padding-top: 1px;
  }

  .msg-row:not(.msg-grouped) {
    padding-top: 6px;
  }

  /* === AVATAR COLUMN — aligns top of avatar with top of bubble === */
  .msg-avatar-col {
    width: 32px;
    flex-shrink: 0;
    margin-right: 6px;
    align-self: flex-start;
    padding-top: 2px;
  }

  /* Spacer to align bubbles in grouped messages with avatar rows */
  .msg-avatar-spacer {
    width: 38px;
    flex-shrink: 0;
  }

  /* === SENDER NAME === */
  .msg-sender {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 2px;
    margin-left: 2px;
    color: var(--color-primary);
    letter-spacing: 0.01em;
    line-height: 1;
    align-self: flex-end;
    padding-bottom: 2px;
  }

  /* === BUBBLE MATERIALS === */
  .msg-bubble {
    padding: 8px 10px 4px 10px;
    position: relative;
    overflow: hidden;
    transition: transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 200ms ease;
    max-width: min(82%, 320px);
    min-width: fit-content;
  }

  .msg-bubble:active {
    transform: scale(0.985);
  }

  /* Sent bubble — emerald */
  .bbl-sent {
    background: var(--color-sent);
    color: var(--color-sent-foreground);
    border-radius: 18px 18px 4px 18px;
    box-shadow:
      0 1px 2px rgba(5, 150, 105, 0.08),
      0 2px 8px rgba(5, 150, 105, 0.1),
      0 0 0 0.5px rgba(5, 150, 105, 0.15);
  }

  .bbl-sent.bbl-grouped {
    border-radius: 18px 18px 4px 18px;
    box-shadow:
      0 1px 3px rgba(5, 150, 105, 0.06),
      0 0 0 0.5px rgba(5, 150, 105, 0.1);
  }

  /* Sent bubble tail */
  .bbl-sent::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: -4px;
    width: 12px;
    height: 14px;
    background: var(--color-sent);
    clip-path: polygon(0 0, 0% 100%, 100% 100%);
    border-bottom-right-radius: 4px;
    opacity: 0.9;
  }

  /* Received bubble — frosted glass */
  .bbl-recv {
    background: var(--color-received);
    color: var(--color-received-foreground);
    border-radius: 18px 18px 18px 4px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 2px 6px rgba(0, 0, 0, 0.03),
      inset 0 1px 0 rgba(255, 255, 255, 0.7),
      inset 0 0 0 0.5px rgba(0, 0, 0, 0.04);
  }

  .bbl-recv.bbl-grouped {
    border-radius: 18px 18px 18px 4px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.03),
      inset 0 1px 0 rgba(255, 255, 255, 0.6),
      inset 0 0 0 0.5px rgba(0, 0, 0, 0.03);
  }

  /* Received bubble tail */
  .bbl-recv::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: -4px;
    width: 12px;
    height: 14px;
    background: var(--color-received);
    clip-path: polygon(100% 0, 0 100%, 100% 100%);
    border-bottom-left-radius: 4px;
    opacity: 0.9;
  }

  /* Pinned ring highlight */
  .bbl-pinned {
    box-shadow:
      0 0 0 1.5px color-mix(in srgb, var(--color-primary) 40%, transparent),
      0 1px 3px rgba(5, 150, 105, 0.1) !important;
  }

  /* === EMOJI-ONLY BUBBLE === */
  .bbl-emoji {
    background: transparent !important;
    box-shadow: none !important;
    padding: 4px 6px 2px !important;
  }
  .bbl-emoji::after {
    display: none;
  }

  .bbl-emoji-text {
    font-size: 40px;
    line-height: 1.2;
  }

  /* === CONTENT === */
  .bbl-text {
    font-size: 15px;
    line-height: 1.42;
    word-break: break-word;
    white-space: pre-wrap;
    margin: 0;
    position: relative;
    z-index: 1;
  }

  .bbl-caption {
    margin-top: 4px;
    font-size: 13px;
    opacity: 0.85;
  }

  /* === IMAGE === */
  .bbl-img-wrap {
    border-radius: 10px;
    overflow: hidden;
    position: relative;
    z-index: 1;
    line-height: 0;
  }

  .bbl-img {
    display: block;
    width: 100%;
    max-height: 300px;
    min-height: 100px;
    object-fit: cover;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 200ms ease, filter 200ms ease;
  }
  .bbl-img:active {
    transform: scale(0.97);
    filter: brightness(0.95);
  }

  .bbl-sys {
    font-size: 13px;
    font-style: italic;
    opacity: 0.7;
    text-align: center;
    margin: 0;
    position: relative;
    z-index: 1;
  }

  /* === REPLY PREVIEW === */
  .rply-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    padding: 6px 8px;
    border-radius: 10px;
    overflow: hidden;
    position: relative;
    z-index: 1;
    background: rgba(0, 0, 0, 0.06);
  }

  .bbl-sent .rply-bar {
    background: rgba(0, 0, 0, 0.12);
  }

  .bbl-recv .rply-bar {
    background: rgba(0, 0, 0, 0.04);
  }

  .rply-accent {
    width: 2.5px;
    border-radius: 2px;
    background: var(--color-primary);
    flex-shrink: 0;
    align-self: stretch;
  }

  .rply-body { min-width: 0; flex: 1; }

  .rply-who {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 1px;
    color: var(--color-primary);
  }

  .rply-text {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.75;
    margin: 0;
  }

  .rply-fallback {
    opacity: 0.5;
    font-style: italic;
  }

  /* === LINK CARD === */
  .link-card {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    padding: 6px 8px;
    border-radius: 10px;
    text-decoration: none;
    transition: transform 150ms ease, background 150ms ease;
    position: relative;
    z-index: 1;
    background: rgba(0, 0, 0, 0.06);
  }
  .bbl-sent .link-card { background: rgba(0, 0, 0, 0.1); }
  .bbl-recv .link-card { background: rgba(0, 0, 0, 0.03); }
  .link-card:active { transform: scale(0.98); }

  .link-icon-wrap {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.06);
    color: var(--color-primary);
  }

  .link-body { min-width: 0; flex: 1; }

  .link-domain {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  /* === INLINE META (inside bubble) === */
  .bbl-meta {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    margin-top: 2px;
    padding: 0 2px;
    min-height: 14px;
    position: relative;
    z-index: 1;
  }

  .bbl-time {
    font-size: 10px;
    opacity: 0.55;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .bbl-edited {
    font-size: 9px;
    font-style: italic;
    opacity: 0.4;
  }

  .bbl-badge { font-size: 9px; line-height: 1; }
  .bbl-pinned-badge { opacity: 0.8; }

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
    transition: opacity 120ms ease;
    box-shadow: 0 4px 16px rgba(5, 150, 105, 0.3);
  }
</style>