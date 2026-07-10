<script lang="ts">
  import type { Message, Reaction } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import DeliveryStatus from '$lib/components/indicators/DeliveryStatus.svelte';
  import AudioPlayer from '$lib/components/media/AudioPlayer.svelte';
  import { Reply as ReplyIcon } from 'lucide-svelte';
  import { chatStore } from '$lib/stores/chat.svelte';

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
    openReactionPicker?: boolean;
  }

  let {
    msg, isOwn, showAvatar = false, senderName, isGrouped = false,
    isPinned = false, isStarred = false, replyPreviewMsg,
    onReply, onLongPress, onImageTap, onReaction, onSwipeReply,
    openReactionPicker = false,
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
      if (!isSwiping) {
        navigator.vibrate?.(50);
        onLongPress?.(msg);
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

  function handleBubbleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleDoubleTap();
  }

  function handleImageClick(e: MouseEvent) {
    e.stopPropagation();
    onImageTap?.(msg.mu!, msg.c || undefined);
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

  // --- Reactions ---
  let msgReactions = $derived(chatStore.getReactions(msg.id));
  let showReactionPicker = $state(false);

  // Watch for external trigger to open reaction picker (from context menu)
  $effect(() => {
    if (openReactionPicker) {
      showReactionPicker = true;
    }
  });

  function toggleReactionPicker(e?: Event) {
    if (e) e.stopPropagation();
    showReactionPicker = !showReactionPicker;
  }

  function handleReactionSelect(emoji: string) {
    showReactionPicker = false;
    onReaction?.(msg, emoji);
  }

  function handleReactionTap(reaction: Reaction) {
    // If user already reacted, tapping removes it
    if (chatStore.hasReacted(msg.id, reaction.emoji)) {
      onReaction?.(msg, reaction.emoji);
    }
  }
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

  <!-- Bubble + Reactions wrapper (stacked vertically) -->
  <div class="msg-content">
    <!-- Bubble -->
    <div
      class="msg-bubble {isOwn ? 'bbl-sent' : 'bbl-recv'} {isGrouped ? 'bbl-grouped' : ''} {isPinned ? 'bbl-pinned' : ''} {isEmojiOnly ? 'bbl-emoji' : ''}"
      onclick={handleDoubleTap}
      role="button"
      tabindex="0"
      onkeydown={handleBubbleKeydown}
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
          onclick={handleImageClick}
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

  <!-- Reactions bar -->
  {#if msgReactions.length > 0 || showReactionPicker}
    <div class="rxn-bar" class:rxn-bar-own={isOwn}>
      {#each msgReactions as rxn (rxn.emoji)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <button
          class="rxn-chip {chatStore.hasReacted(msg.id, rxn.emoji) ? 'rxn-chip-active' : ''}"
          onclick={(e) => { e.stopPropagation(); handleReactionTap(rxn); }}
          ondblclick={(e) => e.stopPropagation()}
        >
          <span class="rxn-emoji">{rxn.emoji}</span>
          <span class="rxn-count">{rxn.uids.length}</span>
        </button>
      {/each}
      <button
        class="rxn-add-btn"
        onclick={(e) => toggleReactionPicker(e)}
        ondblclick={(e) => e.stopPropagation()}
        aria-label="Add reaction"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
  {/if}

  <!-- Reaction picker popup -->
  {#if showReactionPicker}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="rxn-picker-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('rxn-picker-backdrop')) toggleReactionPicker(e); }}>
      <div class="rxn-picker" class:rxn-picker-own={isOwn}>
        {#each ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥', '👎'] as emoji}
          <button
            class="rxn-picker-btn {chatStore.hasReacted(msg.id, emoji) ? 'rxn-picker-btn-active' : ''}"
            onclick={() => handleReactionSelect(emoji)}
          >
            {emoji}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  </div><!-- /msg-content -->
</div><!-- /msg-row -->

<style>
  /* === ROW LAYOUT === */
  .msg-row {
    display: flex;
    position: relative;
    -webkit-user-select: none;
    user-select: none;
    will-change: transform;
    padding: 8px 0;
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
    padding-top: 2px;
    padding-bottom: 2px;
  }

  .msg-row:not(.msg-grouped) {
    padding-top: 8px;
    padding-bottom: 8px;
  }

  /* === BUBBLE + REACTIONS WRAPPER === */
  .msg-content {
    display: flex;
    flex-direction: column;
    max-width: min(82%, 360px);
    min-width: fit-content;
  }

  .msg-own .msg-content { align-items: flex-end; }
  .msg-other .msg-content { align-items: flex-start; }

  /* === AVATAR COLUMN — aligned with bottom of the message stack === */
  .msg-avatar-col {
    width: 32px;
    flex-shrink: 0;
    margin-right: 6px;
    align-self: flex-end;
  }

  /* Spacer to align bubbles in grouped messages with avatar rows */
  .msg-avatar-spacer {
    width: 38px;
    flex-shrink: 0;
  }

  /* === BUBBLE — Premium Messaging Design === */
  .msg-bubble {
    padding: 10px 14px 6px 14px;
    position: relative;
    overflow: hidden;
    transition: transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 200ms ease,
                opacity 150ms ease;
    max-width: 100%;
    min-width: fit-content;
    animation: bubbleSpring 350ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .msg-bubble:active {
    transform: scale(0.985);
  }

  /* Sent bubble — clean primary with subtle gradient shimmer */
  .bbl-sent {
    background: var(--color-sent);
    color: var(--color-sent-foreground, #ffffff);
    border-radius: 20px 20px 6px 20px;
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.08),
      0 4px 16px color-mix(in srgb, var(--color-sent) 25%, transparent);
  }

  .bbl-sent.bbl-grouped {
    border-radius: 14px 14px 4px 14px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.06),
      0 2px 8px color-mix(in srgb, var(--color-sent) 18%, transparent);
  }

  /* Subtle light shimmer on sent bubble */
  .bbl-sent::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%);
    pointer-events: none;
    border-radius: inherit;
  }

  /* Received bubble — elevated surface */
  .bbl-recv {
    background: var(--color-received);
    color: var(--color-received-foreground, #1a1a2e);
    border-radius: 20px 20px 20px 6px;
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.04),
      0 2px 8px rgba(0, 0, 0, 0.06);
    border: 1px solid var(--border-subtle);
  }

  .bbl-recv.bbl-grouped {
    border-radius: 14px 14px 14px 4px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 2px 8px rgba(0, 0, 0, 0.06);
  }

  /* Subtle top highlight on received bubble */
  .bbl-recv::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
    pointer-events: none;
  }

  /* Pinned ring highlight */
  .bbl-pinned {
    box-shadow:
      0 0 0 1.5px color-mix(in srgb, var(--color-primary) 50%, transparent),
      0 2px 12px color-mix(in srgb, var(--color-primary) 15%, transparent) !important;
  }

  .bbl-sent.bbl-pinned {
    box-shadow:
      0 0 0 1.5px color-mix(in srgb, var(--color-primary) 50%, transparent),
      0 4px 16px color-mix(in srgb, var(--color-sent) 30%, transparent) !important;
  }

  /* === EMOJI-ONLY BUBBLE === */
  .bbl-emoji {
    background: transparent !important;
    box-shadow: none !important;
    padding: 4px 6px 2px !important;
    animation: none;
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
  }

  .bbl-sent .rply-bar {
    background: rgba(255, 255, 255, 0.12);
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
  }
  .bbl-sent .link-card { background: rgba(255, 255, 255, 0.1); }
  .bbl-recv .link-card { background: rgba(0, 0, 0, 0.04); }
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
  .bbl-sent .link-icon-wrap {
    background: rgba(255, 255, 255, 0.15);
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
    opacity: 0.5;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .bbl-sent .bbl-time {
    color: rgba(255, 255, 255, 0.75);
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
    box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 35%, transparent);
  }

  /* === REACTIONS BAR === */
  .rxn-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
    padding: 0;
    z-index: 2;
  }

  .rxn-bar-own {
    justify-content: flex-end;
  }

  .rxn-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.2;
    cursor: pointer;
    transition: background 120ms ease, transform 120ms ease, border-color 120ms ease;
    -webkit-tap-highlight-color: transparent;
    min-height: 26px;
  }
  .rxn-chip:active { transform: scale(0.9); }

  .rxn-chip-active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, var(--bg-elevated));
  }

  .rxn-emoji { font-size: 13px; line-height: 1; }

  .rxn-count {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .rxn-chip-active .rxn-count {
    color: var(--color-primary);
  }

  .rxn-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: background 120ms ease, transform 120ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .rxn-add-btn:active { transform: scale(0.85); background: var(--input-bg); }

  /* === REACTION PICKER === */
  .rxn-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
  }

  .rxn-picker {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
    display: flex;
    gap: 2px;
    padding: 6px 8px;
    border-radius: 24px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 0.5px rgba(0,0,0,0.04);
    animation: rxnPickerIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    z-index: 101;
  }

  .rxn-picker-own {
    left: auto;
    right: 0;
  }

  .rxn-picker-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: transparent;
    font-size: 20px;
    cursor: pointer;
    transition: transform 120ms ease, background 120ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .rxn-picker-btn:hover { background: var(--input-bg); }
  .rxn-picker-btn:active { transform: scale(0.85); }

  .rxn-picker-btn-active {
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
    box-shadow: inset 0 0 0 1.5px var(--color-primary);
  }

  @keyframes rxnPickerIn {
    from { opacity: 0; transform: translateY(4px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>