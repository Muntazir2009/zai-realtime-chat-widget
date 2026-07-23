<script lang="ts">
  import type { Message, Reaction } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import DeliveryStatus from '$lib/components/indicators/DeliveryStatus.svelte';
  import AudioPlayer from '$lib/components/media/AudioPlayer.svelte';
  import VideoPlayer from '$lib/components/media/VideoPlayer.svelte';
  import { Reply as ReplyIcon } from 'lucide-svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { prefsStore } from '$lib/stores/prefs.svelte';
  import type { UploadProgress } from '$lib/firebase/storage';

  // Svelte action: non-passive touchmove so preventDefault works for swipe
  // Also clears the entrance animation after it plays so inline transforms
  // (used for swipe physics) are not overridden by the animation's transform.
  function swipeTouchAction(node: HTMLDivElement) {
    // Clear animation once it finishes so inline transform works for swipe
    function onAnimationEnd() {
      node.style.animation = 'none';
    }
    node.addEventListener('animationend', onAnimationEnd);

    function onTouchStart(e: TouchEvent) { handleTouchStart(e); }
    function onTouchMove(e: TouchEvent) { handleTouchMove(e); }
    function onTouchEnd(e: TouchEvent) { handleTouchEnd(); }
    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd, { passive: true });
    return {
      destroy() {
        node.removeEventListener('animationend', onAnimationEnd);
        node.removeEventListener('touchstart', onTouchStart);
        node.removeEventListener('touchmove', onTouchMove);
        node.removeEventListener('touchend', onTouchEnd);
      }
    };
  }

  // Also clear bubble's own animation (bubbleSpring) on swipe touch
  function bubbleTouchAction(node: HTMLDivElement) {
    function onBubbleAnimEnd() {
      node.style.animation = 'none';
    }
    node.addEventListener('animationend', onBubbleAnimEnd);
    function onTouchStart() {
      node.style.animation = 'none';
    }
    node.addEventListener('touchstart', onTouchStart, { passive: true });
    return {
      destroy() {
        node.removeEventListener('animationend', onBubbleAnimEnd);
        node.removeEventListener('touchstart', onTouchStart);
      }
    };
  }

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
    onLongPress?: (msg: Message, x?: number, y?: number) => void;
    onImageTap?: (imageUrl: string, caption?: string) => void;
    onVideoTap?: (url: string, thumbUrl?: string | null, duration?: number, caption?: string) => void;
    onReaction?: (msg: Message, emoji: string) => void;
    onTapReaction?: (msg: Message, x?: number, y?: number) => void;
    onSwipeReply?: (msg: Message) => void;
    onReplyTap?: (messageId: string) => void;
    senderAccentColor?: string | null;
    senderEmojiStatus?: string | null;
    senderAvatarUrl?: string | null;
    uploadProgress?: UploadProgress;
    uploadStatus?: 'uploading' | 'done' | 'error' | 'cancelled';
    onCancelUpload?: () => void;
    onRetryUpload?: () => void;
  }

  let {
    msg, isOwn, showAvatar = false, senderName, isGrouped = false,
    isPinned = false, isStarred = false, replyPreviewMsg,
    onReply, onLongPress, onImageTap, onVideoTap, onReaction, onTapReaction, onSwipeReply, onReplyTap,
    senderAccentColor = null, senderEmojiStatus = null, senderAvatarUrl = null,
    uploadProgress, uploadStatus, onCancelUpload, onRetryUpload,
  }: Props = $props();

  // ── Upload state ──
  let isUploading = $derived(uploadStatus === 'uploading');
  let isUploadError = $derived(uploadStatus === 'error');
  let uploadPct = $derived(uploadProgress?.percentage ?? 0);
  let uploadSpeed = $derived(uploadProgress?.speed ?? 0);
  let uploadEta = $derived(uploadProgress?.eta ?? -1);
  let uploadPhase = $derived(uploadProgress?.phase ?? 'preparing');

  function formatUploadSpeed(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return '';
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }

  function formatUploadEta(seconds: number): string {
    if (seconds < 0 || seconds > 3600) return '';
    if (seconds < 1) return '';
    if (seconds < 60) return `${Math.round(seconds)}s left`;
    return `${Math.floor(seconds / 60)}:${Math.round(seconds % 60).toString().padStart(2, '0')} left`;
  }

  // Circumference for progress ring (r=16, C=2πr≈100.53)
  const PROGRESS_RING_R = 16;
  const PROGRESS_RING_C = 2 * Math.PI * PROGRESS_RING_R;

  // --- Swipe physics state ---
  let touchStartX = 0;
  let touchStartY = 0;
  let lastTouchX = 0;
  let lastTouchTime = 0;
  let isSwiping = false;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let singleTapTimer: ReturnType<typeof setTimeout> | null = null;
  let didLongPress = false;
  let lastTapTime = 0;
  let rowEl: HTMLDivElement | undefined;
  let bubbleEl: HTMLDivElement | undefined;
  let swipeFlash = $state(false);
  let showSwipeIndicator = $state(false);
  let touchMovedPastSlop = false;
  let touchDetected = false;
  let justReacted = $state(false);

  const SWIPE_THRESHOLD = 50;
  const MAX_PULL = 90;
  const TOUCH_SLOP = 14;
  const DOUBLE_TAP_WINDOW = 320;
  const SINGLE_TAP_DELAY = 250;
  const LONG_PRESS_MS = 350;

  let touchOnReaction = false;

  function handleTouchStart(e: TouchEvent) {
    // Ignore touches that start on reaction chips or audio player — they handle themselves
    const target = e.target as HTMLElement;
    if (target.closest('.rxn-bar') || target.closest('.audio-player')) {
      touchOnReaction = true;
      return;
    }
    touchOnReaction = false;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    lastTouchX = touchStartX;
    lastTouchTime = Date.now();
    isSwiping = false;
    didLongPress = false;
    touchMovedPastSlop = false;
    touchDetected = true;
    showSwipeIndicator = false;

    if (rowEl) rowEl.style.animation = 'none';

    // Long press → opens context menu
    longPressTimer = setTimeout(() => {
      if (!isSwiping && !touchMovedPastSlop) {
        didLongPress = true;
        navigator.vibrate?.(30);
        onLongPress?.(msg, touchStartX, touchStartY);
      }
    }, LONG_PRESS_MS);
  }

  function handleTouchMove(e: TouchEvent) {
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    const absDx = Math.abs(cx - touchStartX);
    const absDy = Math.abs(cy - touchStartY);
    const rawDx = isOwn ? touchStartX - cx : cx - touchStartX;
    const dy = absDy;

    // Touch slop: cancel long press if finger moved significantly
    if (!touchMovedPastSlop && (absDx > TOUCH_SLOP || absDy > TOUCH_SLOP)) {
      touchMovedPastSlop = true;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }

    if (rawDx > 8 && dy < rawDx * 0.6) {
      e.preventDefault();
      if (!isSwiping) {
        isSwiping = true;
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      }

      // Simple linear drag with mild rubber-band past threshold
      let offset: number;
      if (rawDx <= SWIPE_THRESHOLD) {
        offset = rawDx;
      } else {
        const over = rawDx - SWIPE_THRESHOLD;
        offset = SWIPE_THRESHOLD + over * 0.3;
      }
      offset = Math.min(offset, MAX_PULL);
      const direction = isOwn ? -1 : 1;

      if (rowEl) {
        rowEl.style.transition = 'none';
        rowEl.style.transform = `translateX(${offset * direction}px)`;
      }

      // Show/hide indicator
      if (rawDx >= SWIPE_THRESHOLD * 0.4 && !showSwipeIndicator) {
        showSwipeIndicator = true;
      } else if (rawDx < SWIPE_THRESHOLD * 0.2 && showSwipeIndicator) {
        showSwipeIndicator = false;
      }
    } else if (dy > 10 && rawDx < 12 && !isSwiping) {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }

    lastTouchX = cx;
    lastTouchTime = Date.now();
  }

  function handleTouchEnd() {
    if (touchOnReaction) { touchOnReaction = false; return; }
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (didLongPress) { didLongPress = false; isSwiping = false; return; }
    if (!isSwiping && !touchMovedPastSlop) {
      // Double-tap detection: if within DOUBLE_TAP_WINDOW, trigger quick ❤️
      const now = Date.now();
      if (now - lastTapTime < DOUBLE_TAP_WINDOW) {
        // Double tap → quick ❤️ reaction
        if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; }
        onReaction?.(msg, '❤️');
        justReacted = true;
        setTimeout(() => { justReacted = false; }, 600);
        lastTapTime = 0;
        return;
      }
      // Single tap → open reaction picker (delayed to allow double-tap detection)
      lastTapTime = now;
      if (singleTapTimer) clearTimeout(singleTapTimer);
      singleTapTimer = setTimeout(() => {
        singleTapTimer = null;
        onTapReaction?.(msg, touchStartX, touchStartY);
      }, SINGLE_TAP_DELAY);
      return;
    }

    // Calculate velocity from last two touch points
    const dt = Date.now() - lastTouchTime;
    const dx = Math.abs(lastTouchX - (isOwn ? touchStartX : touchStartX));
    const velocity = dt > 0 ? dx / dt : 0; // px/ms

    // Read current transform to get actual offset
    const style = rowEl?.style.transform || '';
    const match = style.match(/translateX\((-?\d+\.?\d*)px\)/);
    const currentPx = match ? Math.abs(parseFloat(match[1])) : 0;

    const shouldTrigger = currentPx >= SWIPE_THRESHOLD * 0.75 || (currentPx >= SWIPE_THRESHOLD * 0.3 && velocity > 0.3);

    if (shouldTrigger && rowEl) {
      navigator.vibrate?.(25);
      swipeFlash = true;
      const dir = isOwn ? -1 : 1;
      // Quick snap out then back
      rowEl.style.transition = 'transform 150ms ease-out, opacity 150ms ease';
      rowEl.style.transform = `translateX(${SWIPE_THRESHOLD * dir}px) scale(0.97)`;
      rowEl.style.opacity = '0.85';
      onSwipeReply?.(msg);
      setTimeout(() => {
        swipeFlash = false;
        showSwipeIndicator = false;
        if (rowEl) {
          rowEl.style.transition = 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1), opacity 200ms ease';
          rowEl.style.transform = 'translateX(0) scale(1)';
          rowEl.style.opacity = '1';
          setTimeout(() => { if (rowEl) rowEl.style.transition = ''; }, 350);
        }
      }, 150);
    } else if (rowEl) {
      // Smooth spring-back with CSS transition (no rAF needed)
      showSwipeIndicator = false;
      const duration = Math.min(200 + currentPx * 2, 400);
      rowEl.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
      rowEl.style.transform = 'translateX(0) scale(1)';
      rowEl.style.opacity = '1';
      setTimeout(() => { if (rowEl) rowEl.style.transition = ''; }, duration + 50);
    }

    isSwiping = false;
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    // Right-click on desktop opens context menu
    onLongPress?.(msg, e.clientX, e.clientY);
  }

  function handleBubbleClick(e: MouseEvent) {
    // On touch devices, ignore click events (handled by touch events)
    if (touchDetected) {
      touchDetected = false;
      return;
    }
    // Desktop: single click → reaction picker, double click → ❤️
    const now = Date.now();
    if (now - lastTapTime < 350) {
      // Double click → quick ❤️ reaction
      if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; }
      onReaction?.(msg, '❤️');
      justReacted = true;
      setTimeout(() => { justReacted = false; }, 600);
      lastTapTime = 0;
    } else {
      // Single click → open reaction picker (delayed for double-click detection)
      lastTapTime = now;
      if (singleTapTimer) clearTimeout(singleTapTimer);
      singleTapTimer = setTimeout(() => {
        singleTapTimer = null;
        onTapReaction?.(msg, e.clientX, e.clientY);
      }, 300);
    }
  }

  function handleBubbleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') onTapReaction?.(msg);
    if (e.key === ' ' || e.key === 'ContextMenu') {
      e.preventDefault();
      onLongPress?.(msg);
    }
  }

  function handleImageClick(e: MouseEvent) {
    e.stopPropagation();
    onImageTap?.(msg.mu!, msg.c || undefined);
  }

  // --- Derived ---
  const timeStr = $derived.by(() => {
    if (prefsStore.timestampFormat === 'none') return '';
    const d = new Date(msg.ts);
    const hour12 = !prefsStore.use24HourFormat;
    if (prefsStore.timestampFormat === 'absolute') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });
    }
    // relative
    const now = Date.now();
    const diff = now - msg.ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });
  });

  // Compute delivery/read status for own messages
  const deliveryStatus = $derived.by(() => {
    if (msg.rk && !msg.ts) return 'sending' as const;
    if (!isOwn) return 'sent' as const;

    const chatId = chatStore.activeChatId;
    if (!chatId) return 'sent' as const;

    const lrid = chatStore.otherUserReadIds.get(chatId);
    if (!lrid) return 'delivered' as const;

    const msgs = chatStore.messages;
    const lridIdx = msgs.findIndex(m => m.id === lrid);
    const thisIdx = msgs.findIndex(m => m.id === msg.id);
    if (lridIdx !== -1 && thisIdx !== -1 && thisIdx <= lridIdx) return 'read' as const;

    return 'delivered' as const;
  });

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

  // Detect if message is emoji-only for larger display
  // Supports ZWJ sequences, skin-tone modifiers, keycaps, regional indicators, etc.
  const emojiOnlyRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{200C}\u{1F3FB}-\u{1F3FF}\u{1F9B0}-\u{1F9D0}\u{E0020}-\u{E007F}]+$/u;
  const isEmojiOnly = $derived(
    msg.t === 'text' && emojiOnlyRegex.test(msg.c.trim()) && msg.c.trim().length <= 30
  );

  // Discord-style markdown headings: # ## ### at message start
  const headingLevel = $derived(() => {
    if (msg.t !== 'text' || isEmojiOnly) return 0;
    const text = msg.c;
    if (/^###\s/.test(text)) return 3;
    if (/^##\s/.test(text)) return 2;
    if (/^#\s[^#]/.test(text)) return 1;
    return 0;
  });

  // Strip the heading prefix for rendering
  const displayText = $derived(() => {
    if (headingLevel() === 3) return msg.c.replace(/^###\s/, '');
    if (headingLevel() === 2) return msg.c.replace(/^##\s/, '');
    if (headingLevel() === 1) return msg.c.replace(/^#\s/, '');
    return msg.c;
  });

  // Media quality-aware image source selection
  function getMediaSrc(): string {
    // GIF: show thumbnail if autoPlay is off
    if (msg.c === 'GIF' && !prefsStore.autoPlayMedia && msg.mh) return msg.mh;
    // Low quality: prefer thumbnail if available
    if (prefsStore.mediaQuality === 'low' && msg.mh) return msg.mh;
    return msg.mu || '';
  }

  // --- Reactions ---
  let msgReactions = $derived(chatStore.getReactions(msg.id));
  let rxnAddBtn: HTMLButtonElement | undefined;

  function handleReactionTap(e: MouseEvent, reaction: Reaction) {
    e.stopPropagation();
    e.preventDefault();
    onReaction?.(msg, reaction.emoji);
  }

  function handleAddReactionTap(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    onTapReaction?.(msg, e.clientX, e.clientY);
  }

  function stopTouchPropagation(e: TouchEvent) {
    e.stopPropagation();
  }
</script>

<div
  class="msg-row {swipeFlash ? 'swipe-flash' : ''}"
  class:msg-own={isOwn}
  class:msg-other={!isOwn}
  class:msg-grouped={isGrouped}
  bind:this={rowEl}
  role="article"
  aria-label="Message from {isOwn ? 'you' : senderName || 'unknown'}"
  oncontextmenu={handleContextMenu}
  use:swipeTouchAction
>
  <!-- Swipe Reply Indicator -->
  {#if showSwipeIndicator}
    <div
      class="swipe-indicator"
      style="
        {isOwn ? 'right: 8px;' : 'left: 8px;'}
      "
    >
      <ReplyIcon size={14} />
      <span class="swipe-label">Reply</span>
    </div>
  {/if}

  <!-- Avatar — aligned with bubble top -->
  {#if !isOwn && showAvatar}
    <div class="msg-avatar-col">
      <Avatar username={senderName || '?'} size="sm" avatarUrl={senderAvatarUrl} accentColor={senderAccentColor} emojiStatus={senderEmojiStatus} />
    </div>
  {:else if !isOwn && !showAvatar}
    <!-- Spacer to keep alignment with avatar rows -->
    <div class="msg-avatar-spacer"></div>
  {/if}

  <!-- Bubble + Reactions wrapper (stacked vertically) -->
  <div class="msg-content">
    <!-- Bubble -->
    <div
      class="msg-bubble {isOwn ? 'bbl-sent' : 'bbl-recv'} {isGrouped ? 'bbl-grouped' : ''} {isPinned ? 'bbl-pinned' : ''} {isEmojiOnly ? 'bbl-emoji' : ''} {justReacted ? 'bbl-just-reacted' : ''}"
      style={!isOwn && senderAccentColor ? `border-left: 3px solid ${senderAccentColor};` : ''}
      onclick={handleBubbleClick}
      role="button"
      tabindex="0"
      onkeydown={handleBubbleKeydown}
      use:bubbleTouchAction
    >
    <!-- Reply Preview -->
    {#if msg.rid}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="rply-bar"
        role="button"
        tabindex={0}
        onclick={(e) => { e.stopPropagation(); onReplyTap?.(msg.rid!); }}
        onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onReplyTap?.(msg.rid!); } }}
      >
        <div class="rply-accent"></div>
        <div class="rply-body">
          {#if replyPreviewMsg}
            {@const replySender = chatStore.userDict.get(replyPreviewMsg.sid)}
            <p class="rply-who">{replyPreviewMsg.sid === (msg.sid) ? (isOwn ? 'You' : (senderName || 'Unknown')) : (replySender?.displayName || (replyPreviewMsg.sid === authStore.user?.id ? 'You' : 'Unknown'))}</p>
            <p class="rply-text">{replyPreviewMsg.t === 'image' ? '📷 Photo' : replyPreviewMsg.t === 'video' ? '🎬 Video' : replyPreviewMsg.t === 'voice' ? '🎙 Voice' : (replyPreviewMsg.c.replace(/\n/g, ' ').slice(0, 120))}</p>
          {:else}
            <p class="rply-text rply-fallback">↩ Reply</p>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Content -->
    {#if msg.t === 'text'}
      {#if headingLevel() > 0}
        <p class="bbl-text bbl-heading bbl-h{headingLevel()}">{displayText()}</p>
      {:else}
        <p class="bbl-text {isEmojiOnly ? 'bbl-emoji-text' : ''}">{msg.c}</p>
      {/if}
      {#if urlMatch() && prefsStore.showLinkPreviews}
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
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="voice-bubble" onclick={(e) => e.stopPropagation()} ontouchstart={(e) => e.stopPropagation()} onpointerdown={(e) => e.stopPropagation()}>
        <AudioPlayer url={msg.mu} duration={(msg.md?.duration as number) || 0} />
      </div>
    {:else if msg.t === 'video' && msg.mu}
      <div class="bbl-img-wrap">
        <VideoPlayer
          url={msg.mu}
          thumbnailUrl={(msg.md?.thumbnailUrl as string) || msg.mh || null}
          duration={(msg.md?.duration as number) || 0}
          onVideoTap={() => onVideoTap?.(msg.mu!, (msg.md?.thumbnailUrl as string) || msg.mh || null, (msg.md?.duration as number) || 0, msg.c)}
        />
        {#if isUploading}
          <div class="upload-overlay">
            <svg class="upload-ring" viewBox="0 0 36 36" width="42" height="42">
              <circle cx="18" cy="18" r="{PROGRESS_RING_R}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
              <circle
                cx="18" cy="18" r="{PROGRESS_RING_R}"
                fill="none"
                stroke="white"
                stroke-width="3"
                stroke-linecap="round"
                stroke-dasharray="{PROGRESS_RING_C}"
                stroke-dashoffset="{PROGRESS_RING_C * (1 - uploadPct / 100)}"
                style="transition: stroke-dashoffset 200ms ease; transform: rotate(-90deg); transform-origin: center;"
              />
              <text x="18" y="18" text-anchor="middle" dominant-baseline="central" fill="white" font-size="8" font-weight="700">{Math.round(uploadPct)}%</text>
            </svg>
            <div class="upload-meta-text">
              <span class="upload-speed-text">{formatUploadSpeed(uploadSpeed)}</span>
              <span class="upload-eta-text">{formatUploadEta(uploadEta)}</span>
            </div>
          </div>
        {/if}
        {#if isUploadError}
          <div class="upload-overlay upload-error-overlay">
            <button class="upload-retry-btn" onclick={(e) => { e.stopPropagation(); onRetryUpload?.(); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2.5 11.5a10 10 0 0 1 18.8-4.3"/><path d="M21.5 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            </button>
            <span class="upload-error-label">Tap to retry</span>
          </div>
        {/if}
      </div>
    {:else if msg.t === 'image' && msg.mu}
      <div class="bbl-img-wrap">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <img
          src={getMediaSrc()}
          alt={msg.c || 'Shared image'}
          class="bbl-img"
          loading={prefsStore.mediaQuality === 'high' ? 'eager' : 'lazy'}
          onclick={handleImageClick}
        />
        {#if !prefsStore.autoPlayMedia && msg.c === 'GIF'}
          <div class="gif-badge">GIF</div>
        {/if}
        {#if isUploading}
          <div class="upload-overlay">
            <svg class="upload-ring" viewBox="0 0 36 36" width="42" height="42">
              <circle cx="18" cy="18" r="{PROGRESS_RING_R}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
              <circle
                cx="18" cy="18" r="{PROGRESS_RING_R}"
                fill="none"
                stroke="white"
                stroke-width="3"
                stroke-linecap="round"
                stroke-dasharray="{PROGRESS_RING_C}"
                stroke-dashoffset="{PROGRESS_RING_C * (1 - uploadPct / 100)}"
                style="transition: stroke-dashoffset 200ms ease; transform: rotate(-90deg); transform-origin: center;"
              />
              <text x="18" y="18" text-anchor="middle" dominant-baseline="central" fill="white" font-size="8" font-weight="700">{Math.round(uploadPct)}%</text>
            </svg>
            <div class="upload-meta-text">
              <span class="upload-speed-text">{formatUploadSpeed(uploadSpeed)}</span>
              <span class="upload-eta-text">{formatUploadEta(uploadEta)}</span>
            </div>
          </div>
        {/if}
        {#if isUploadError}
          <div class="upload-overlay upload-error-overlay">
            <button class="upload-retry-btn" onclick={(e) => { e.stopPropagation(); onRetryUpload?.(); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2.5 11.5a10 10 0 0 1 18.8-4.3"/><path d="M21.5 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            </button>
            <span class="upload-error-label">Tap to retry</span>
          </div>
        {/if}
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
      {#if timeStr}
        <span class="bbl-time">{timeStr}</span>
      {/if}
      {#if isOwn}
        <DeliveryStatus status={deliveryStatus} />
      {/if}
    </div>
  </div>

  <!-- Reactions bar -->
  {#if msgReactions.length > 0}
    <div class="rxn-bar" class:rxn-bar-own={isOwn} ontouchstart={stopTouchPropagation}>
      {#each msgReactions as rxn (rxn.emoji)}
        <button
          class="rxn-chip {chatStore.hasReacted(msg.id, rxn.emoji) ? 'rxn-chip-active' : ''}"
          onclick={(e) => handleReactionTap(e, rxn)}
          ontouchstart={stopTouchPropagation}
          ontouchend={stopTouchPropagation}
          ondblclick={(e) => e.stopPropagation()}
        >
          <span class="rxn-emoji">{rxn.emoji}</span>
          <span class="rxn-count">{rxn.uids.length}</span>
        </button>
      {/each}
      <button
        class="rxn-add-btn"
        bind:this={rxnAddBtn}
        onclick={handleAddReactionTap}
        ontouchstart={stopTouchPropagation}
        ontouchend={stopTouchPropagation}
        ondblclick={(e) => e.stopPropagation()}
        aria-label="Add reaction"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
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
    padding: var(--msg-row-pad, 6px) 0;
    align-items: flex-end;
    animation: msgBubbleIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
    contain: layout style;
  }

  .msg-row.msg-grouped {
    animation: msgBubbleInGrouped 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .msg-own {
    justify-content: flex-end;
    padding-left: 64px;
    padding-right: 12px;
  }

  .msg-other {
    justify-content: flex-start;
    padding-left: 12px;
    padding-right: 64px;
  }

  .msg-grouped {
    padding-top: 1px;
    padding-bottom: 1px;
  }

  .msg-row:not(.msg-grouped) {
    padding-top: var(--msg-row-pad-top, 10px);
    padding-bottom: var(--msg-row-pad, 6px);
  }

  /* === BUBBLE + REACTIONS WRAPPER === */
  .msg-content {
    display: flex;
    flex-direction: column;
    max-width: min(82%, 360px);
    min-width: fit-content;
  }

  /* Emoji-only messages break out of max-width for large display */
  .msg-row:has(.bbl-emoji) .msg-content {
    max-width: min(85%, 420px);
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
    padding: var(--msg-bubble-pad, 10px 14px 6px 14px);
    position: relative;
    overflow: hidden;
    transition: transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 250ms ease,
                opacity 150ms ease;
    max-width: 100%;
    min-width: fit-content;
    animation: bubbleSpring 350ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .msg-bubble:active {
    transform: scale(0.985) translateY(-1px);
    box-shadow:
      0 3px 6px rgba(0, 0, 0, 0.08),
      0 8px 20px -2px color-mix(in srgb, var(--color-sent) 22%, transparent),
      0 2px 4px rgba(0, 0, 0, 0.04);
  }

  /* Reaction bounce on the bubble */
  .msg-bubble.bbl-just-reacted {
    animation: reactionPulse 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes reactionPulse {
    0% { transform: scale(1); }
    30% { transform: scale(1.015); }
    100% { transform: scale(1); }
  }

  /* Subtle hover lift on desktop */
  @media (hover: hover) {
    .msg-bubble {
      cursor: default;
    }
    .bbl-sent:hover {
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.06),
        0 6px 16px -2px color-mix(in srgb, var(--color-sent) 25%, transparent),
        0 2px 4px rgba(0, 0, 0, 0.03);
    }
    .bbl-recv:hover {
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.04),
        0 4px 12px -1px rgba(0, 0, 0, 0.07);
    }
    .bbl-sent.bbl-grouped:hover {
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.04),
        0 4px 10px -1px color-mix(in srgb, var(--color-sent) 18%, transparent);
    }
    .bbl-recv.bbl-grouped:hover {
      box-shadow:
        0 1px 3px rgba(0, 0, 0, 0.03),
        0 3px 8px -1px rgba(0, 0, 0, 0.06);
    }
  }

  /* Sent bubble — clean primary with subtle gradient shimmer */
  .bbl-sent {
    background: linear-gradient(135deg, color-mix(in srgb, var(--color-sent) 100%, white), color-mix(in srgb, var(--color-sent) 92%, white));
    color: var(--color-sent-foreground, #ffffff);
    border-radius: var(--bubble-radius, 20px) var(--bubble-radius, 20px) 6px var(--bubble-radius, 20px);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.06),
      0 4px 12px -2px color-mix(in srgb, var(--color-sent) 20%, transparent),
      0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .bbl-grouped {
    margin-top: 2px;
  }

  .bbl-sent.bbl-grouped {
    border-radius: calc(var(--bubble-radius, 20px) - 6px) calc(var(--bubble-radius, 20px) - 6px) 4px calc(var(--bubble-radius, 20px) - 6px);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 2px 6px -1px color-mix(in srgb, var(--color-sent) 14%, transparent);
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
    border-radius: var(--bubble-radius, 20px) var(--bubble-radius, 20px) var(--bubble-radius, 20px) 6px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.03),
      0 2px 8px -1px rgba(0, 0, 0, 0.05);
    border: 1px solid var(--border-subtle);
  }

  .bbl-recv.bbl-grouped {
    border-radius: calc(var(--bubble-radius, 20px) - 6px) calc(var(--bubble-radius, 20px) - 6px) calc(var(--bubble-radius, 20px) - 6px) 4px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.02),
      0 1px 4px -1px rgba(0, 0, 0, 0.04);
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
    padding: 2px 4px 0 !important;
    animation: none;
    max-width: none !important;
  }

  .bbl-emoji-text {
    font-size: min(180px, 40vw);
    line-height: 1.15;
  }

  /* === CONTENT === */
  .bbl-text {
    font-size: var(--msg-font-size, 15px);
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

  /* === DISCORD-STYLE MARKDOWN HEADINGS === */
  .bbl-heading {
    white-space: pre-wrap;
  }

  .bbl-h1 {
    font-size: 22px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }

  .bbl-h2 {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .bbl-h3 {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.35;
  }

  /* === IMAGE === */
  .bbl-img-wrap {
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    z-index: 1;
    line-height: 0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }

  .gif-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.04em;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    pointer-events: none;
  }

  .bbl-img {
    display: block;
    width: 100%;
    max-height: 300px;
    min-height: 100px;
    object-fit: cover;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 200ms ease, filter 200ms ease, box-shadow 200ms ease;
  }
  @media (hover: hover) {
    .bbl-img:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
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
    max-width: 100%;
    cursor: pointer;
    transition: opacity 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .rply-bar:active {
    opacity: 0.7;
  }

  .bbl-sent .rply-bar {
    background: rgba(255, 255, 255, 0.12);
  }

  .bbl-recv .rply-bar {
    background: rgba(0, 0, 0, 0.04);
  }

  .rply-accent {
    width: 3px;
    border-radius: 3px;
    background: var(--color-primary);
    flex-shrink: 0;
    align-self: stretch;
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  .rply-body { min-width: 0; flex: 1; overflow: hidden; }

  .rply-who {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 1px;
    color: var(--color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rply-text {
    font-size: 12px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-word;
    opacity: 0.75;
    margin: 0;
    max-width: 100%;
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
    gap: 4px;
    margin-top: 2px;
    margin-bottom: -2px;
    padding: 0 2px;
    min-height: 14px;
    position: relative;
    z-index: 1;
  }

  .bbl-time {
    font-size: 11px;
    opacity: 0.5;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    margin-right: 2px;
    font-weight: 500;
  }
  .bbl-sent .bbl-time {
    color: rgba(255, 255, 255, 0.7);
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
    transform: translateY(-50%) scale(1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px 14px;
    border-radius: 9999px;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
    z-index: 5;
    box-shadow: 0 4px 20px color-mix(in srgb, var(--color-primary) 40%, transparent),
                0 0 0 0 color-mix(in srgb, var(--color-primary) 0%, transparent);
    will-change: opacity, transform, box-shadow;
    letter-spacing: 0.01em;
    animation: swipeIndicatorIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes swipeIndicatorIn {
    from { opacity: 0; transform: translateY(-50%) scale(0.7); }
    to { opacity: 1; transform: translateY(-50%) scale(1); }
  }

  .swipe-label {
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
  }

  .swipe-flash {
    z-index: 2;
  }

  .msg-row.swipe-flash .msg-bubble {
    box-shadow: 0 0 0 2px var(--color-primary),
                0 0 24px color-mix(in srgb, var(--color-primary) 25%, transparent) !important;
  }

  /* === VOICE BUBBLE (event isolation) === */
  .voice-bubble {
    position: relative;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  /* === REACTIONS BAR === */
  .rxn-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 3px;
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
    padding: 2px 7px;
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.2;
    cursor: pointer;
    transition: background 150ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), border-color 150ms ease, box-shadow 150ms ease;
    -webkit-tap-highlight-color: transparent;
    min-height: 26px;
  }
  .rxn-chip:active { transform: scale(0.88); }
  @media (hover: hover) {
    .rxn-chip:hover {
      background: color-mix(in srgb, var(--color-primary) 8%, var(--bg-elevated));
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
  }

  .rxn-chip-active {
    border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
    background: color-mix(in srgb, var(--color-primary) 12%, var(--bg-elevated));
    box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary) 15%, transparent);
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
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: background 150ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), color 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .rxn-add-btn:active { transform: scale(0.82); background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-primary); }
  @media (hover: hover) {
    .rxn-add-btn:hover { background: var(--input-bg); color: var(--text-secondary); }
  }

  @keyframes msgBubbleIn {
    from { opacity: 0; transform: translateY(6px) scale(0.99); }
    60% { opacity: 1; }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes msgBubbleInGrouped {
    from { opacity: 0; transform: translateY(3px) scale(0.995); }
    50% { opacity: 1; }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ── Upload Overlay ── */
  .upload-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border-radius: var(--radius-lg, 16px);
    z-index: 5;
    animation: uploadOverlayIn 200ms ease both;
  }

  @keyframes uploadOverlayIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .upload-ring {
    filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
  }

  .upload-meta-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .upload-speed-text,
  .upload-eta-text {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
  }

  .upload-error-overlay {
    background: rgba(0, 0, 0, 0.55);
    gap: 4px;
  }

  .upload-retry-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.15);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .upload-retry-btn:active {
    transform: scale(0.85);
    background: rgba(255, 255, 255, 0.3);
  }

  .upload-error-label {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  }
</style>