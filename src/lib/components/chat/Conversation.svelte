<script lang="ts">
  import { ChevronLeft, MoreVertical, Clock, Image as ImageIcon, Pin, X, Trash2, BellOff, Bell, Wallpaper } from 'lucide-svelte';
  import MessageBubble from './MessageBubble.svelte';
  import Lightbox from '$lib/components/media/Lightbox.svelte';
  import MediaGallery from '$lib/components/media/MediaGallery.svelte';
  import MessageContextMenu from './MessageContextMenu.svelte';
  import InputBar from './InputBar.svelte';
  import ReplyPreview from './ReplyPreview.svelte';
  import ScrollToBottom from './ScrollToBottom.svelte';
  import TypingIndicator from '$lib/components/indicators/TypingIndicator.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import type { Message } from '$lib/types/index';
  import { format, isToday, isYesterday, startOfDay } from 'date-fns';
  import EasterEggFx from './EasterEggFx.svelte';
  import WallpaperPicker from './WallpaperPicker.svelte';

  let messagesContainer: HTMLDivElement | undefined = $state();
  let showMenu = $state(false);
  let showMediaGallery = $state(false);
  let showWallpaperPicker = $state(false);
  let showPinnedPanel = $state(false);
  let pinBannerPointerStart: { x: number; y: number } | null = null;
  let isMuted = $state(false);
  let contextMenuMsg: Message | null = $state(null);
  let showContextMenu = $state(false);
  let lightboxImages = $state<Array<{url: string; caption?: string}>>([]);
  let lightboxIndex = $state(0);
  let showLightbox = $state(false);
  let editingMsg: Message | null = $state(null);
  let editText = $state('');
  let triggerEasterEgg = $state(0);
  let isNearBottom = $state(true);
  let prevMsgCount = 0;
  let showScrollFab = $state(false);
  let newMsgWhileScrolled = $state(0);
  let prevScrollHeight = 0;
  let lastSeenMsgCount = $state(0);

  // Watch for incoming messages with easter egg metadata (from other user)
  $effect(() => {
    const len = chatStore.messages.length;
    if (len <= lastSeenMsgCount) {
      lastSeenMsgCount = len;
      return;
    }
    // Check new messages for egg flag
    const userId = authStore.user?.id;
    for (let i = lastSeenMsgCount; i < len; i++) {
      const m = chatStore.messages[i];
      if (m?.sid !== userId && m.md?.egg) {
        // Delay slightly so the message appears first, then the effect plays
        setTimeout(() => { triggerEasterEgg++; }, 200);
        break;
      }
    }
    lastSeenMsgCount = len;
  });

  let otherUser = $derived.by(() => {
    const meta = chatStore.activeChatId ? chatStore.chats.get(chatStore.activeChatId) : undefined;
    return chatStore.getOtherParticipant(meta);
  });

  let chatWallpaper = $derived.by(() => {
    if (!chatStore.activeChatId) return null as string | null;
    const meta = chatStore.chats.get(chatStore.activeChatId);
    return meta?.wallpaper ?? null;
  });

  let wallpaperStyle = $derived.by(() => {
    const wp = chatWallpaper;
    if (!wp) return '';
    if (wp.startsWith('http')) return `background-image: url('${wp}'); background-size: cover; background-position: center;`;
    return `background: ${wp};`;
  });

  let otherPresence = $derived.by(() => {
    if (!otherUser) return null;
    return chatStore.presence.get(otherUser.id) ?? null;
  });

  // Tick every 30s so "Last seen Xm ago" re-formats without needing presence changes
  let presenceTick = $state(0);
  $effect(() => {
    const t = setInterval(() => { presenceTick++; }, 30_000);
    return () => clearInterval(t);
  });

  let formattedLastSeen = $derived.by(() => {
    void presenceTick; // track tick so this re-evaluates
    if (!otherPresence || !otherPresence.lastSeen) return null;
    if (otherPresence.status === 'online') return null;
    return formatLastSeen(otherPresence.lastSeen);
  });

  let typingNames = $derived.by(() => {
    if (!chatStore.activeChatId || !authStore.user) return [];
    const chatId = chatStore.activeChatId;
    // Access _typingTick to ensure reactivity triggers on every typing change
    const _tick = (chatStore as any)._typingTick;
    void _tick;
    const uids = chatStore.typingUsers.get(chatId);
    if (!uids) return [];
    // Only show OTHER users typing, not yourself
    return Array.from(uids)
      .filter(uid => uid !== authStore.user!.id)
      .map(uid => chatStore.userDict.get(uid)?.displayName ?? 'Someone');
  });

  let sortedPinned = $derived.by(() => {
    return Array.from(chatStore.pinnedMessages.entries())
      .sort((a, b) => {
        const metaA = chatStore.pinnedMeta.get(a[0]);
        const metaB = chatStore.pinnedMeta.get(b[0]);
        return (metaB?.pinnedAt ?? 0) - (metaA?.pinnedAt ?? 0);
      })
      .map(([id, msg]) => ({
        id,
        msg,
        pinnedBy: chatStore.pinnedMeta.get(id)?.pinnedBy ?? '',
        pinnedAt: chatStore.pinnedMeta.get(id)?.pinnedAt ?? 0,
      }));
  });

  // For pinned panel: who pinned each message
  let pinnedItemAuthor = $derived.by((() => {
    const cache = new Map<string, string>();
    return (uid: string) => {
      if (cache.has(uid)) return cache.get(uid)!;
      const name = chatStore.userDict.get(uid)?.displayName ?? 'Unknown';
      cache.set(uid, name);
      return name;
    };
  })());

  let messageGroups = $derived.by(() => {
    const groups: Array<{ date: string; isToday: boolean; isYesterday: boolean; messages: typeof chatStore.messages }> = [];
    let currentDate = '';
    for (const msg of chatStore.messages) {
      const msgDate = format(startOfDay(msg.ts), 'yyyy-MM-dd');
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, isToday: isToday(msg.ts), isYesterday: isYesterday(msg.ts), messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  });

  function formatDateLabel(date: string, isToday: boolean, isYesterday: boolean): string {
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return format(new Date(date), 'MMM d, yyyy');
  }

  function getReplyMessage(msg: Message): Message | null {
    if (!msg.rid) return null;
    return chatStore.messages.find(m => m.id === msg.rid) ?? null;
  }

  // Scroll to a specific message and highlight it
  let highlightedMsgId = $state<string | null>(null);
  function scrollToMessage(messageId: string) {
    const el = messagesContainer?.querySelector(`[data-msg-id="${messageId}"]`);
    if (!el || !messagesContainer) return;
    // Remove previous highlight
    if (highlightedMsgId) {
      const prev = messagesContainer.querySelector(`[data-msg-id="${highlightedMsgId}"]`);
      prev?.classList.remove('msg-highlight');
    }
    highlightedMsgId = messageId;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('msg-highlight');
    setTimeout(() => {
      el.classList.remove('msg-highlight');
      if (highlightedMsgId === messageId) highlightedMsgId = null;
    }, 1500);
  }

  // Scroll tracking
  function updateScrollState() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    const distFromBottom = scrollHeight - scrollTop - clientHeight;
    const wasNearBottom = isNearBottom;
    isNearBottom = distFromBottom < 120;
    showScrollFab = distFromBottom > 200;

    // Count new messages while scrolled up
    if (scrollHeight > prevScrollHeight + 40 && !wasNearBottom) {
      newMsgWhileScrolled++;
    }
    prevScrollHeight = scrollHeight;
  }

  // Smart auto-scroll: only if user was already near bottom
  $effect(() => {
    const len = chatStore.messages.length;
    if (len === 0 || !messagesContainer) return;
    if (len > prevMsgCount && isNearBottom) {
      requestAnimationFrame(() => {
        if (messagesContainer) {
          messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
          newMsgWhileScrolled = 0;
        }
      });
    }
    prevMsgCount = len;
  });

  // Initial scroll to bottom on chat open
  $effect(() => {
    if (chatStore.activeChatId && messagesContainer) {
      requestAnimationFrame(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      });
    }
  });

  function goBack() {
    showMenu = false;
    chatStore.closeChat();
    uiStore.setView('chatList');
  }

  function checkEasterEgg(content: string): 'heart' | 'kiss' | null {
    const lower = content.toLowerCase().trim();
    if (['❤️', 'i love you', 'love you', 'love u'].includes(lower)) return 'heart';
    if (['💋', 'mwah', 'muah', 'muahh', 'mwahh', 'kiss'].includes(lower)) return 'kiss';
    return null;
  }

  function handleSend(content: string) {
    if (!chatStore.activeChatId) return;
    const easter = checkEasterEgg(content);
    const meta = easter ? { egg: easter } : undefined;
    if (easter === 'heart' || easter === 'kiss') triggerEasterEgg++;
    const replyToId = uiStore.replyTo?.id;
    chatStore.sendMessage(chatStore.activeChatId, content, replyToId, meta);
    uiStore.setReplyTo(null);
  }

  async function handleImageSend(imageUrl: string) {
    if (!chatStore.activeChatId) return;
    await chatStore.sendImageMessage(chatStore.activeChatId, imageUrl);
  }

  function handleReply(msg: Message) { uiStore.setReplyTo(msg); }

  function handleSwipeReply(msg: Message) {
    uiStore.setReplyTo(msg);
    toastStore.success('Reply');
  }

  function handleLongPress(msg: Message) {
    contextMenuMsg = msg;
    showContextMenu = true;
  }

  function handleCopyText(text: string) {
    navigator.clipboard?.writeText(text).then(() => toastStore.success('Copied')).catch(() => toastStore.error('Failed to copy'));
  }

  async function handleDeleteMessage(msg: Message) {
    if (!chatStore.activeChatId) return;
    await chatStore.deleteMessage(chatStore.activeChatId, msg.id);
  }

  async function handlePinMessage(msg: Message) {
    if (!chatStore.activeChatId) return;
    await chatStore.togglePin(chatStore.activeChatId, msg);
  }

  async function handleStarMessage(msg: Message) {
    if (!chatStore.activeChatId) return;
    await chatStore.toggleStar(chatStore.activeChatId, msg);
  }

  function handleEditMessage(msg: Message) { editingMsg = msg; editText = msg.c; }

  // Track which message should show its reaction picker (triggered from context menu)
  let reactionPickerTargetId: string | null = $state(null);

  function handleReactFromMenu(msg: Message) {
    // Set the target so MessageBubble can pick it up.
    // Use setTimeout instead of rAF — rAF fires before Svelte's $effect
    // has a chance to propagate the openReactionPicker=true update to
    // MessageBubble, causing the picker to never open.
    reactionPickerTargetId = msg.id;
    setTimeout(() => { reactionPickerTargetId = null; }, 300);
  }

  async function saveEdit() {
    if (!chatStore.activeChatId || !editingMsg) return;
    if (!editText.trim()) { toastStore.error('Cannot be empty'); return; }
    await chatStore.editMessage(chatStore.activeChatId, editingMsg.id, editText.trim());
    editingMsg = null; editText = '';
  }

  function cancelEdit() { editingMsg = null; editText = ''; }

  function handleImageTap(imageUrl: string, caption?: string) {
    lightboxImages = chatStore.messages.filter(m => m.t === 'image' && m.mu).map(m => ({ url: m.mu!, caption: m.c || undefined }));
    lightboxIndex = lightboxImages.findIndex(i => i.url === imageUrl);
    if (lightboxIndex < 0) lightboxIndex = 0;
    showLightbox = true;
  }

  function handleReaction(msg: Message, emoji: string) {
    if (!chatStore.activeChatId) return;
    if (emoji === '❤️' || emoji === '💋') triggerEasterEgg++;
    chatStore.toggleReaction(chatStore.activeChatId, msg.id, emoji);
  }

  function handleStickerSelect(sticker: string) {
    if (!chatStore.activeChatId) return;
    const isEggSticker = ['❤️', '💕', '💗', '💋', '😘'].includes(sticker);
    const meta = isEggSticker ? { egg: 'heart' } : undefined;
    chatStore.sendMessage(chatStore.activeChatId, sticker, undefined, meta);
    if (isEggSticker) triggerEasterEgg++;
  }

  function handleGifSelect(gifUrl: string) {
    if (chatStore.activeChatId) chatStore.sendImageMessage(chatStore.activeChatId, gifUrl, 'GIF');
  }

  function scrollToBottom() {
    if (!messagesContainer) return;
    newMsgWhileScrolled = 0;
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
  }

  function formatLastSeen(ts: number): string {
    const now = Date.now();
    const diff = now - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function formatPinnedTime(ts: number): string {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // Close menu on any touch that isn't a deliberate tap on the menu button
  function handleGlobalTouchStart(e: TouchEvent) {
    if (!showMenu) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.menu-trigger-btn') && !target.closest('.menu-sheet')) {
      showMenu = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && showMenu) {
      showMenu = false;
    }
    if (e.key === 'Escape' && showMediaGallery) {
      showMediaGallery = false;
    }
  }

  // Media items for gallery (image + GIF messages)
  let mediaItems = $derived.by(() => {
    return chatStore.messages
      .filter(m => (m.t === 'image' || m.c === 'GIF') && m.mu)
      .map(m => ({ url: m.mu!, type: 'image' as const, id: m.id }));
  });

  function handleClearChat() {
    if (!chatStore.activeChatId) return;
    showMenu = false;
    // Use a simple confirm dialog via chatStore
    if (confirm('Clear all messages in this chat? This cannot be undone.')) {
      chatStore.messages = [];
    }
  }

  // Pin banner tap detection (reliable on mobile)
  function onPinBannerPointerDown(e: PointerEvent) {
    pinBannerPointerStart = { x: e.clientX, y: e.clientY };
  }
  function onPinBannerPointerUp(e: PointerEvent) {
    if (!pinBannerPointerStart) return;
    const dx = Math.abs(e.clientX - pinBannerPointerStart.x);
    const dy = Math.abs(e.clientY - pinBannerPointerStart.y);
    pinBannerPointerStart = null;
    if (dx < 10 && dy < 10) {
      showPinnedPanel = true;
    }
  }
</script>

<svelte:window ontouchstart={handleGlobalTouchStart} onkeydown={handleKeyDown} />

<div class="conv-shell" style="background: var(--bg-page); {wallpaperStyle}">
  {#if triggerEasterEgg > 0}
    <EasterEggFx trigger={triggerEasterEgg} />
  {/if}

  <!-- Premium Glass Header -->
  <header class="header-glass safe-top">
    <div class="header-inner">
      <button class="h-btn" onclick={goBack} aria-label="Back">
        <ChevronLeft size={22} />
      </button>

      <button class="header-center" onclick={() => undefined}>
        <div class="avatar-wrap">
          <Avatar
            username={otherUser?.username ?? '?'}
            size="sm"
            avatarUrl={otherUser?.avatarUrl}
            accentColor={otherUser?.accentColor}
            emojiStatus={otherUser?.emojiStatus}
          />
          {#if otherPresence?.status === 'online'}
            <span class="online-dot"></span>
          {/if}
        </div>
        <div class="header-info">
          <p class="header-name">{otherUser?.displayName ?? 'Unknown'}</p>
          {#if otherUser?.bio}
            <p class="header-bio" style="font-size: 11px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; margin: 1px 0 0;">{otherUser.bio}</p>
          {/if}
          {#if typingNames.length > 0}
            <div class="header-sub header-typing">
              <span class="typing-text">typing</span>
              <span class="h-typing-dots">
                <span class="htd"></span><span class="htd"></span><span class="htd"></span>
              </span>
            </div>
          {:else if otherPresence?.status === 'online'}
            <p class="header-sub header-online">Online</p>
          {:else if otherPresence}
            <p class="header-sub header-away">
              {otherPresence.status === 'offline' && formattedLastSeen
                ? `Last seen ${formattedLastSeen}`
                : otherPresence.status === 'away' ? 'Away' : 'Offline'}
            </p>
          {:else}
            <p class="header-sub header-default">Tap for info</p>
          {/if}
        </div>
      </button>

      <div class="header-actions">
        <button class="h-btn h-btn-sm menu-trigger-btn" class:menu-open={showMenu} onclick={() => (showMenu = !showMenu)} aria-label="More options">
          <MoreVertical size={18} />
        </button>
      </div>
    </div>
  </header>

  <!-- Pinned Banner -->
  {#if sortedPinned.length > 0}
    <button class="pin-banner" onpointerdown={onPinBannerPointerDown} onpointerup={onPinBannerPointerUp} onpointercancel={() => (pinBannerPointerStart = null)} aria-label="View pinned messages">
      <div class="pin-inner">
        <Pin size={13} style="color: var(--color-primary); flex-shrink: 0;" />
        <div class="pin-content">
          <p class="pin-label">Pinned{sortedPinned.length > 1 ? ` (${sortedPinned.length})` : ''}</p>
          <p class="pin-text">{sortedPinned[0].msg.t === 'image' ? '📷 Photo' : sortedPinned[0].msg.c.slice(0, 60)}</p>
        </div>
        <svg class="pin-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    </button>
  {/if}

  <!-- Messages -->
  <div
    bind:this={messagesContainer}
    class="msg-scroll"
    onscroll={updateScrollState}
  >
    {#if chatStore.messages.length === 0}
      <div class="empty-state">
        <div class="empty-avatar-wrap">
          {#if otherUser}
            <Avatar username={otherUser.username} size="lg" />
          {:else}
            <div class="empty-avatar-fallback">?</div>
          {/if}
        </div>
        <p class="empty-title">{otherUser?.displayName || 'Start the conversation'}</p>
        <p class="empty-desc">Say hello! Messages are delivered in real time.</p>
      </div>
    {:else}
      {#each messageGroups as group (group.date)}
        <div class="date-separator">
          <div class="date-chip">
            <Clock size={10} />
            <span>{formatDateLabel(group.date, group.isToday, group.isYesterday)}</span>
          </div>
        </div>

        {#each group.messages as msg, idx (msg.id)}
          {@const isOwn = msg.sid === authStore.user?.id}
          {@const prevMsg = idx > 0 ? group.messages[idx - 1] : null}
          {@const nextMsg = idx < group.messages.length - 1 ? group.messages[idx + 1] : null}
          {@const isConsecutive = prevMsg?.sid === msg.sid}
          {@const isLastInGroup = nextMsg?.sid !== msg.sid}
          <div data-msg-id={msg.id}>
          <MessageBubble
            {msg}
            {isOwn}
            showAvatar={!isOwn && isLastInGroup}
            senderName={chatStore.userDict.get(msg.sid)?.displayName}
            isGrouped={isConsecutive}
            isPinned={chatStore.pinnedMessages.has(msg.id)}
            isStarred={chatStore.starredMessageIds.has(msg.id)}
            replyPreviewMsg={getReplyMessage(msg)}
            onReply={handleReply}
            onLongPress={handleLongPress}
            onImageTap={handleImageTap}
            onReaction={handleReaction}
            onSwipeReply={handleSwipeReply}
            onReplyTap={scrollToMessage}
            openReactionPicker={reactionPickerTargetId === msg.id}
            senderAccentColor={msg.sid === authStore.user?.id ? null : (chatStore.userDict.get(msg.sid)?.accentColor ?? null)}
            senderEmojiStatus={msg.sid === authStore.user?.id ? null : (chatStore.userDict.get(msg.sid)?.emojiStatus ?? null)}
            senderAvatarUrl={chatStore.userDict.get(msg.sid)?.avatarUrl ?? null}
          />
          </div>
        {/each}
      {/each}
    {/if}

    <!-- Scroll padding at bottom for nav bar -->
    <div class="scroll-bottom-pad"></div>
  </div>

  <!-- Scroll to Bottom FAB -->
  {#if showScrollFab}
    <button class="scroll-fab" onclick={scrollToBottom} aria-label="Scroll to bottom">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      {#if newMsgWhileScrolled > 0}
        <span class="fab-count">{newMsgWhileScrolled > 9 ? '9+' : newMsgWhileScrolled}</span>
      {/if}
    </button>
  {/if}

  <!-- Floating Input Area -->
  <div class="floating-input-area">
    <!-- Typing indicator -->
    {#if typingNames.length > 0}
      <div class="typing-area">
        <TypingIndicator usernames={typingNames} />
      </div>
    {/if}

    <!-- Edit Bar -->
    {#if editingMsg}
      <div class="edit-bar">
        <div class="edit-header">
          <div class="edit-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            <span>Edit message</span>
          </div>
        </div>
        <div class="edit-body">
          <textarea
            bind:value={editText}
            rows={2}
            class="edit-input"
            style="color: var(--text-primary); -webkit-user-select: text; user-select: text;"
            placeholder="Edit your message..."
          ></textarea>
          <div class="edit-actions">
            <button class="edit-cancel" onclick={cancelEdit}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              <span>Cancel</span>
            </button>
            <button class="edit-save" onclick={saveEdit}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Reply Preview -->
    {#if uiStore.replyTo}
      <ReplyPreview
        message={uiStore.replyTo}
        senderName={chatStore.userDict.get(uiStore.replyTo.sid)?.displayName ?? 'Unknown'}
        onCancel={() => uiStore.setReplyTo(null)}
      />
    {/if}

    <!-- Input Bar -->
    <InputBar
      onSend={handleSend}
      onImageSend={handleImageSend}
      onStickerSelect={handleStickerSelect}
      onGifSelect={handleGifSelect}
    />
  </div>

  <!-- Lightbox -->
  {#if showLightbox && lightboxImages.length > 0}
    <Lightbox images={lightboxImages} initialIndex={lightboxIndex} onClose={() => (showLightbox = false)} />
  {/if}

  <!-- Context Menu -->
  {#if contextMenuMsg}
    <MessageContextMenu
      open={showContextMenu}
      onClose={() => { showContextMenu = false; contextMenuMsg = null; }}
      msg={contextMenuMsg}
      isOwn={contextMenuMsg.sid === authStore.user?.id}
      isPinned={chatStore.pinnedMessages.has(contextMenuMsg.id)}
      isStarred={chatStore.starredMessageIds.has(contextMenuMsg.id)}
      onReply={handleReply}
      onCopy={handleCopyText}
      onDelete={handleDeleteMessage}
      onPin={handlePinMessage}
      onStar={handleStarMessage}
      onEdit={handleEditMessage}
      onReact={handleReactFromMenu}
    />
  {/if}
</div>

<!-- Menu Overlay -->
{#if showMenu}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="menu-overlay" style="background: var(--overlay-bg);" onclick={() => (showMenu = false)} onkeydown={(e) => e.key === 'Escape' && (showMenu = false)} role="button" tabindex="-1">
    <div class="menu-sheet">
      <button class="menu-item" onclick={() => { showMenu = false; showMediaGallery = true; }}>
        <ImageIcon size={17} style="color: var(--text-secondary);" />
        <span>View media</span>
        {#if mediaItems.length > 0}
          <span class="menu-badge">{mediaItems.length}</span>
        {/if}
      </button>
      <button class="menu-item" onclick={() => { showMenu = false; showWallpaperPicker = true; }}>
        <Wallpaper size={17} style="color: {chatWallpaper ? 'var(--color-primary)' : 'var(--text-secondary)'};" />
        <span>Wallpaper</span>
        {#if chatWallpaper}
          <span class="menu-badge" style="background: var(--color-primary); color: var(--color-primary-foreground); font-size: 10px; padding: 1px 6px;">Set</span>
        {/if}
      </button>
      <button class="menu-item" onclick={() => { showMenu = false; isMuted = !isMuted; }}>
        {#if isMuted}
          <BellOff size={17} style="color: var(--text-secondary);" />
          <span>Unmute chat</span>
        {:else}
          <Bell size={17} style="color: var(--text-secondary);" />
          <span>Mute chat</span>
        {/if}
      </button>
      <button class="menu-item menu-item-danger" onclick={() => { showMenu = false; handleClearChat(); }}>
        <Trash2 size={17} style="color: var(--color-danger);" />
        <span style="color: var(--color-danger);">Clear chat</span>
      </button>
    </div>
  </div>
{/if}

<!-- Media Gallery -->
{#if showMediaGallery}
  <MediaGallery items={mediaItems} onClose={() => (showMediaGallery = false)} />
{/if}

<!-- Wallpaper Picker -->
{#if showWallpaperPicker && chatStore.activeChatId}
  <WallpaperPicker
    chatId={chatStore.activeChatId}
    currentWallpaper={chatWallpaper}
    onClose={() => (showWallpaperPicker = false)}
  />
{/if}

<!-- Pinned Messages Panel -->
{#if showPinnedPanel}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pin-panel-backdrop" onclick={() => (showPinnedPanel = false)} onkeydown={(e) => e.key === 'Escape' && (showPinnedPanel = false)}>
    <div class="pin-panel-sheet" onclick={(e) => e.stopPropagation()}>
      <!-- Header -->
      <div class="pin-panel-header">
        <div class="pin-panel-title-wrap">
          <Pin size={16} style="color: var(--color-primary);" />
          <h2 class="pin-panel-title">Pinned Messages</h2>
          <span class="pin-panel-count">{sortedPinned.length}</span>
        </div>
        <button class="pin-panel-close" onclick={() => (showPinnedPanel = false)} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <!-- Pinned list -->
      <div class="pin-panel-list">
        {#each sortedPinned as item (item.id)}
          {@const senderName = chatStore.userDict.get(item.msg.sid)?.displayName ?? 'Unknown'}
          {@const isOwn = item.msg.sid === authStore.user?.id}
          <div class="pin-card">
            <div class="pin-card-body" onclick={() => { showPinnedPanel = false; scrollToMessage(item.id); }}>
              <div class="pin-card-avatar">
                <div class="pin-avatar-circle" style="background: {isOwn ? 'var(--color-primary)' : 'var(--input-bg)'}; color: {isOwn ? 'var(--color-primary-foreground)' : 'var(--text-secondary)'};">
                  {senderName.charAt(0).toUpperCase()}
                </div>
              </div>
              <div class="pin-card-content">
                <div class="pin-card-top">
                  <span class="pin-card-sender">{senderName}</span>
                  <span class="pin-card-time">{formatPinnedTime(item.pinnedAt)}</span>
                </div>
                <p class="pin-card-text">
                  {item.msg.t === 'image' ? '📷 Photo' : item.msg.c.length > 120 ? item.msg.c.slice(0, 120) + '…' : item.msg.c}
                </p>
                {#if item.pinnedBy}
                  <p class="pin-card-meta">Pinned by {pinnedItemAuthor(item.pinnedBy)}</p>
                {/if}
              </div>
            </div>
            <div class="pin-card-actions">
              <button
                class="pin-action-btn pin-action-goto"
                onclick={() => { showPinnedPanel = false; scrollToMessage(item.id); }}
                aria-label="Scroll to message"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <span>Go to</span>
              </button>
              <button
                class="pin-action-btn pin-action-unpin"
                onclick={() => handlePinMessage(item.msg)}
                aria-label="Unpin message"
              >
                <Pin size={14} />
                <span>Unpin</span>
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Empty (shouldn't happen since panel only opens when there are pins) -->
      {#if sortedPinned.length === 0}
        <div class="pin-panel-empty">
          <Pin size={24} style="color: var(--text-tertiary);" />
          <p style="color: var(--text-tertiary); margin: 8px 0 0;">No pinned messages</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* === SHELL === */
  .conv-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    -webkit-user-select: none;
    user-select: none;
    overflow: hidden;
  }

  /* === PREMIUM HEADER === */
  .header-glass {
    background: var(--glass-bg);
    backdrop-filter: blur(32px) saturate(220%);
    -webkit-backdrop-filter: blur(32px) saturate(220%);
    box-shadow: 0 0.5px 0 var(--border-subtle), 0 4px 24px rgba(0,0,0,0.04), 0 1px 0 color-mix(in srgb, var(--color-primary) 8%, transparent);
    z-index: 50;
    position: relative;
    flex-shrink: 0;
    border-bottom: 0.5px solid color-mix(in srgb, var(--glass-border) 80%, transparent);
  }

  .header-inner {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    height: 56px;
    min-height: 56px;
  }

  .h-btn {
    min-width: 40px;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md, 12px);
    color: var(--text-primary);
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    border: none;
    background: transparent;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .h-btn:active { transform: scale(0.88); background: var(--input-bg); }

  .h-btn-sm {
    min-width: 36px;
    min-height: 36px;
    width: 36px;
    height: 36px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .header-center {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 6px 8px;
    border-radius: var(--radius-md, 12px);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .header-center:active { transform: scale(0.98); background: var(--input-bg); }

  .avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .online-dot {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid var(--bg-surface, #16161e);
    background: #22c55e;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
    animation: dotPulse 2s ease-in-out infinite;
  }

  @keyframes dotPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
    50% { box-shadow: 0 0 0 5px rgba(34, 197, 94, 0); }
  }

  .header-info { min-width: 0; flex: 1; }

  .header-name {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
    letter-spacing: -0.01em;
  }

  .header-sub {
    font-size: 12px;
    line-height: 1.3;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 1px;
    margin-top: 1px;
  }

  .header-online { color: var(--color-primary); font-weight: 500; }
  .header-away { color: var(--text-tertiary); }
  .header-default { color: var(--text-tertiary); font-style: italic; }

  .header-typing {
    color: var(--color-primary) !important;
    font-weight: 500;
    animation: typingFadeIn 300ms cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  @keyframes typingFadeIn {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .typing-text { font-size: 12px; }

  .h-typing-dots {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 1px;
  }
  .htd {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-primary);
    animation: hTypingBounce 1.4s ease-in-out infinite;
  }
  .htd:nth-child(2) { animation-delay: 0.15s; }
  .htd:nth-child(3) { animation-delay: 0.3s; }

  @keyframes hTypingBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  /* Menu button rotation */
  .menu-trigger-btn {
    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }
  .menu-open {
    transform: rotate(90deg);
  }
  .menu-open:active {
    transform: rotate(90deg) scale(0.88);
  }

  /* === PINNED BANNER === */
  .pin-banner {
    width: 100%;
    padding: 4px 10px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-bottom: 0.5px solid var(--border-subtle);
    animation: pinBannerIn 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
    flex-shrink: 0;
    border: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 150ms ease;
    position: relative;
    z-index: 5;
    touch-action: manipulation;
    min-height: 44px;
  }
  .pin-banner:active { background: color-mix(in srgb, var(--input-bg) 60%, transparent); }

  .pin-inner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: var(--radius-md, 12px);
    background: var(--input-bg);
    width: 100%;
    text-align: left;
  }

  .pin-chevron {
    flex-shrink: 0;
    color: var(--text-tertiary);
    margin-left: auto;
    transition: transform 200ms ease;
  }
  .pin-banner:active .pin-chevron { transform: translateX(2px); }

  .pin-content { min-width: 0; flex: 1; }

  .pin-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
    margin: 0 0 1px 0;
  }

  .pin-text {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-primary);
    margin: 0;
  }

  /* === MESSAGE SCROLL === */
  .msg-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0 0;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background-attachment: fixed;
    transition: background 0.4s ease;
  }
  .msg-scroll::-webkit-scrollbar { width: 0px; }

  .msg-scroll-wp {
    background-color: transparent !important;
  }

  .scroll-bottom-pad {
    height: 12px;
    flex-shrink: 0;
  }

  /* === DATE SEPARATOR === */
  .date-separator {
    display: flex;
    justify-content: center;
    margin: 12px 0 8px;
  }

  .date-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 99px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }

  /* === SCROLL FAB === */
  .scroll-fab {
    position: absolute;
    bottom: 80px;
    right: 12px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    z-index: 20;
    padding: 0;
    background: var(--glass-bg);
    backdrop-filter: blur(20px) saturate(200%);
    -webkit-backdrop-filter: blur(20px) saturate(200%);
    border: var(--glass-border);
    box-shadow: 0 4px 20px rgba(0,0,0,0.1), 0 2px 8px color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
    min-width: 40px;
    min-height: 40px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fabIn 350ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease, opacity 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .scroll-fab:active { transform: scale(0.88); }

  @keyframes fabIn {
    from { opacity: 0; transform: scale(0.5) translateY(16px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .fab-count {
    position: absolute;
    top: -5px;
    right: -7px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary) 40%, transparent);
    animation: badgePulse 2s ease-in-out infinite;
    line-height: 1;
  }

  @keyframes badgePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }

  /* === EMPTY STATE === */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 32px 24px;
    animation: fadeIn 500ms ease both;
  }

  .empty-avatar-wrap {
    width: 80px;
    height: 80px;
    border-radius: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 10%, transparent), color-mix(in srgb, var(--color-primary) 4%, transparent));
    box-shadow: 0 4px 20px color-mix(in srgb, var(--color-primary) 8%, transparent);
    animation: emptyFloat 5s ease-in-out infinite;
  }

  @keyframes emptyFloat {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(-8px) rotate(1deg); }
    75% { transform: translateY(-4px) rotate(-0.5deg); }
  }

  .empty-avatar-fallback {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 24px;
    color: white;
    background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 80%, #000));
  }

  .empty-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 6px 0;
    letter-spacing: -0.01em;
  }

  .empty-desc {
    font-size: 14px;
    text-align: center;
    max-width: 240px;
    line-height: 1.5;
    color: var(--text-tertiary);
    margin: 0;
  }

  /* === FLOATING INPUT AREA (in flex flow, not absolute) === */
  .floating-input-area {
    flex-shrink: 0;
    position: relative;
    z-index: 30;
    transform: translateY(-10px);
  }

  /* === TYPING AREA === */
  .typing-area {
    padding: 0 12px 2px;
    animation: typingFadeIn 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
    flex-shrink: 0;
  }

  /* === EDIT BAR === */
  .edit-bar {
    flex-shrink: 0;
    padding: 0 10px 6px;
    animation: editSlideIn 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes editSlideIn {
    from { opacity: 0; transform: translateY(8px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .edit-header {
    display: flex;
    align-items: center;
    padding: 0 4px 6px;
  }

  .edit-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .edit-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 16px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 0.5px rgba(0, 0, 0, 0.03);
  }

  .edit-input {
    width: 100%;
    min-height: 56px;
    max-height: 120px;
    padding: 10px 12px;
    border-radius: 12px;
    outline: none;
    resize: none;
    font-size: 15px;
    line-height: 1.45;
    background: var(--input-bg);
    border: 1.5px solid var(--border-subtle);
    color: var(--text-primary);
    font-family: var(--font-sans, inherit);
    transition: border-color 200ms ease, box-shadow 200ms ease;
    -webkit-user-select: text;
    user-select: text;
  }

  .edit-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .edit-input::placeholder {
    color: var(--text-tertiary);
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .edit-cancel {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--input-bg);
    border: 1px solid var(--border-subtle);
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .edit-cancel:active {
    transform: scale(0.94);
    background: var(--border-subtle);
  }

  .edit-save {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border: none;
    cursor: pointer;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .edit-save:active {
    transform: scale(0.94);
    box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }

  /* === MENU OVERLAY === */
  .menu-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    animation: fadeIn 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .menu-sheet {
    position: absolute;
    top: 62px;
    right: 10px;
    min-width: 180px;
    padding: 5px;
    border-radius: var(--radius-lg, 16px);
    background: var(--bg-elevated);
    backdrop-filter: blur(24px) saturate(200%);
    -webkit-backdrop-filter: blur(24px) saturate(200%);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.06);
    z-index: 61;
    animation: menuSlideIn 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 12px;
    min-height: 42px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    border-radius: var(--radius-md, 12px);
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .menu-item:active { transform: scale(0.96); background: var(--input-bg); }

  .menu-badge {
    margin-left: auto;
    padding: 1px 7px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .menu-item-danger:active {
    background: color-mix(in srgb, var(--color-danger) 8%, transparent);
  }

  /* === UTILITIES === */
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.9) translateY(-4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-100%); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes menuSlideIn {
    from { opacity: 0; transform: translateY(-8px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes pinBannerIn {
    from { opacity: 0; transform: translateY(-100%); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes typingFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Message highlight animation for reply-tap navigation */
  [data-msg-id].msg-highlight {
    position: relative;
  }

  [data-msg-id].msg-highlight::before {
    content: '';
    position: absolute;
    inset: 0 6px;
    border-radius: 14px;
    background: var(--color-primary);
    animation: msgHighlightOverlay 1.6s ease both;
    pointer-events: none;
    z-index: 2;
  }

  @keyframes msgHighlightOverlay {
    0% { opacity: 0.2; }
    15% { opacity: 0.25; }
    100% { opacity: 0; }
  }

  /* === PINNED MESSAGES PANEL === */
  .pin-panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: var(--overlay-bg);
    animation: pinPanelFadeIn 200ms ease both;
  }

  @keyframes pinPanelFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .pin-panel-sheet {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 75vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-elevated);
    border-radius: var(--radius-xl, 20px) var(--radius-xl, 20px) 0 0;
    box-shadow: 0 -4px 32px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.06);
    animation: pinPanelSlideUp 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
    overflow: hidden;
  }

  @keyframes pinPanelSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .pin-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 12px;
    flex-shrink: 0;
    border-bottom: 0.5px solid var(--border-subtle);
  }

  .pin-panel-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pin-panel-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .pin-panel-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
    font-size: 11px;
    font-weight: 700;
  }

  .pin-panel-close {
    min-width: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: var(--input-bg);
    color: var(--text-secondary);
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .pin-panel-close:active { transform: scale(0.88); background: var(--border-subtle); }

  .pin-panel-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px 24px;
    -webkit-overflow-scrolling: touch;
  }
  .pin-panel-list::-webkit-scrollbar { width: 0px; }

  .pin-card {
    background: var(--input-bg);
    border-radius: var(--radius-lg, 16px);
    margin-bottom: 8px;
    border: 1px solid var(--border-subtle);
    overflow: hidden;
    animation: pinCardIn 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .pin-card:last-child { margin-bottom: 0; }

  @keyframes pinCardIn {
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .pin-card-body {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 12px 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 150ms ease;
    min-height: 44px;
  }
  .pin-card-body:active { background: var(--border-subtle); }

  .pin-card-avatar {
    flex-shrink: 0;
    padding-top: 2px;
  }

  .pin-avatar-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
  }

  .pin-card-content {
    flex: 1;
    min-width: 0;
  }

  .pin-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 3px;
  }

  .pin-card-sender {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .pin-card-time {
    font-size: 11px;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .pin-card-text {
    font-size: 14px;
    line-height: 1.45;
    color: var(--text-secondary);
    margin: 0;
    word-break: break-word;
  }

  .pin-card-meta {
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 4px 0 0;
    font-style: italic;
  }

  .pin-card-actions {
    display: flex;
    border-top: 0.5px solid var(--border-subtle);
  }

  .pin-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 0;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 150ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
    min-height: 44px;
  }
  .pin-action-btn:active { transform: scale(0.95); }

  .pin-action-goto {
    color: var(--color-primary);
    border-right: 0.5px solid var(--border-subtle);
  }
  .pin-action-goto:active { background: color-mix(in srgb, var(--color-primary) 8%, transparent); }

  .pin-action-unpin {
    color: var(--color-danger, #ef4444);
  }
  .pin-action-unpin:active { background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent); }

  .pin-panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
  }
</style>