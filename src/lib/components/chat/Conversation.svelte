<script lang="ts">
  import { ChevronLeft, MoreVertical, Clock, Image as ImageIcon, Pin } from 'lucide-svelte';
  import MessageBubble from './MessageBubble.svelte';
  import Lightbox from '$lib/components/media/Lightbox.svelte';
  import MessageContextMenu from './MessageContextMenu.svelte';
  import InputBar from './InputBar.svelte';
  import ReplyPreview from './ReplyPreview.svelte';
  import ScrollToBottom from './ScrollToBottom.svelte';
  import TypingIndicator from '$lib/components/indicators/TypingIndicator.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import ParticleRain from '$lib/components/effects/ParticleRain.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import type { Message } from '$lib/types/index';
  import { format, isToday, isYesterday, startOfDay } from 'date-fns';

  const EASTER_TRIGGERS = ['i love you', 'love you', 'love u', 'mwah', 'muah', 'muahh', 'mwahh', 'kiss', '❤️', '💋'];

  let messagesContainer: HTMLDivElement | undefined = $state();
  let showMenu = $state(false);
  let contextMenuMsg: Message | null = $state(null);
  let showContextMenu = $state(false);
  let lightboxImages = $state<Array<{url: string; caption?: string}>>([]);
  let lightboxIndex = $state(0);
  let showLightbox = $state(false);
  let editingMsg: Message | null = $state(null);
  let editText = $state('');
  let triggerHeartRain = $state(false);
  let triggerKissRain = $state(false);
  let isNearBottom = $state(true);
  let prevMsgCount = 0;

  let otherUser = $derived.by(() => {
    const meta = chatStore.activeChatId ? chatStore.chats.get(chatStore.activeChatId) : undefined;
    return chatStore.getOtherParticipant(meta);
  });

  let otherPresence = $derived.by(() => {
    if (!otherUser) return null;
    return chatStore.presence.get(otherUser.id) ?? null;
  });

  let typingNames = $derived(
    chatStore.activeChatId ? chatStore.getTypingUsersForChat(chatStore.activeChatId) : [],
  );

  let sortedPinned = $derived.by(() => {
    return Array.from(chatStore.pinnedMessages.entries())
      .sort((a, b) => b[1].ts - a[1].ts)
      .map(([id, msg]) => ({ id, msg }));
  });

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

  // Smart auto-scroll: only if user was already near bottom
  $effect(() => {
    const len = chatStore.messages.length;
    if (len === 0 || !messagesContainer) return;
    if (len > prevMsgCount && isNearBottom) {
      requestAnimationFrame(() => {
        if (messagesContainer) {
          messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
        }
      });
    }
    prevMsgCount = len;
  });

  function goBack() {
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
    if (easter === 'heart') triggerHeartRain = !triggerHeartRain;
    else if (easter === 'kiss') triggerKissRain = !triggerKissRain;
    const replyToId = uiStore.replyTo?.id;
    chatStore.sendMessage(chatStore.activeChatId, content, replyToId);
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
    try { await chatStore.deleteMessage(chatStore.activeChatId, msg.id); toastStore.success('Deleted'); }
    catch { toastStore.error('Failed to delete'); }
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
    if (emoji === '❤️') triggerHeartRain = !triggerHeartRain;
    if (emoji === '💋') triggerKissRain = !triggerKissRain;
    chatStore.sendMessage(chatStore.activeChatId, emoji);
  }

  function handleStickerSelect(sticker: string) {
    if (!chatStore.activeChatId) return;
    chatStore.sendMessage(chatStore.activeChatId, sticker);
    if (['❤️', '💕', '💗'].includes(sticker)) triggerHeartRain = !triggerHeartRain;
    if (['💋', '😘'].includes(sticker)) triggerKissRain = !triggerKissRain;
  }

  function handleGifSelect(gifUrl: string) {
    if (chatStore.activeChatId) chatStore.sendImageMessage(chatStore.activeChatId, gifUrl, 'GIF');
  }
</script>

<div class="flex flex-col h-full relative" style="background-color: var(--bg-page);">
  <ParticleRain type="heart" trigger={triggerHeartRain} />
  <ParticleRain type="kiss" trigger={triggerKissRain} />

  <!-- Premium Header -->
  <header class="header-glass safe-top">
    <div class="header-inner">
      <button class="h-btn" onclick={goBack} aria-label="Back">
        <ChevronLeft size={24} />
      </button>

      <button class="header-center" onclick={() => {}}>
        <div class="avatar-wrap">
          <Avatar
            username={otherUser?.username ?? '?'}
            size="sm"
            status={otherPresence?.status ?? otherUser?.status}
            avatarUrl={otherUser?.avatarUrl}
          />
          {#if otherPresence?.status === 'online'}
            <span class="online-ring"></span>
          {/if}
        </div>
        <div class="header-info">
          <p class="header-name">{otherUser?.displayName ?? 'Unknown'}</p>
          {#if typingNames.length > 0}
            <p class="header-sub typing-sub">
              {typingNames.length === 1 ? 'typing' : 'typing'}
              <span class="typing-dots">
                <span class="td"></span><span class="td"></span><span class="td"></span>
              </span>
            </p>
          {:else if otherPresence?.status === 'online'}
            <p class="header-sub" style="color: var(--color-primary);">Online</p>
          {:else if otherPresence}
            <p class="header-sub" style="color: var(--text-tertiary);">
              {otherPresence.status === 'offline' && otherPresence.lastSeen > 0
                ? `Last seen ${new Date(otherPresence.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`
                : otherPresence.status === 'away' ? 'Away' : 'Offline'}
            </p>
          {:else}
            <p class="header-sub" style="color: var(--text-tertiary);">Tap for info</p>
          {/if}
        </div>
      </button>

      <button class="h-btn" onclick={() => (showMenu = !showMenu)} aria-label="More options">
        <MoreVertical size={20} />
      </button>
    </div>
  </header>

  <!-- Pinned Banner -->
  {#if sortedPinned.length > 0}
    <div class="pin-banner">
      <div class="pin-inner">
        <Pin size={13} style="color: var(--color-primary); flex-shrink: 0;" />
        <div class="pin-content">
          <p class="pin-label">Pinned{sortedPinned.length > 1 ? ` (${sortedPinned.length})` : ''}</p>
          <p class="pin-text">{sortedPinned[0].msg.t === 'image' ? '📷 Photo' : sortedPinned[0].msg.c.slice(0, 80)}</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Messages -->
  <div
    bind:this={messagesContainer}
    class="msg-scroll scroll-momentum"
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
            <Clock size={11} />
            <span>{formatDateLabel(group.date, group.isToday, group.isYesterday)}</span>
          </div>
        </div>

        {#each group.messages as msg, idx (msg.id)}
          {@const isOwn = msg.sid === authStore.user?.id}
          {@const prevMsg = idx > 0 ? group.messages[idx - 1] : null}
          {@const nextMsg = idx < group.messages.length - 1 ? group.messages[idx + 1] : null}
          {@const isConsecutive = prevMsg?.sid === msg.sid}
          {@const isLastInGroup = nextMsg?.sid !== msg.sid}
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
          />
        {/each}
      {/each}
    {/if}

    <ScrollToBottom messagesContainer={messagesContainer} />
  </div>

  <!-- Typing indicator -->
  {#if typingNames.length > 0}
    <div class="typing-area">
      <TypingIndicator usernames={typingNames} />
    </div>
  {/if}

  <!-- Edit Bar -->
  {#if editingMsg}
    <div class="edit-bar">
      <div class="edit-accent"></div>
      <span class="edit-label">Edit</span>
      <textarea
        bind:value={editText}
        rows={1}
        class="edit-input"
        style="color: var(--text-primary); -webkit-user-select: text; user-select: text;"
      ></textarea>
      <button class="edit-save" onclick={saveEdit}>Save</button>
      <button class="edit-cancel" onclick={cancelEdit} aria-label="Cancel edit">
        ✕
      </button>
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
    />
  {/if}
</div>

<!-- Menu Overlay -->
{#if showMenu}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="menu-overlay" style="background: var(--overlay-bg);" onclick={() => (showMenu = false)} onkeydown={(e) => e.key === 'Escape' && (showMenu = false)} role="button" tabindex="-1">
    <div class="menu-sheet">
      <button class="menu-item" onclick={() => { showMenu = false; }}>
        <ImageIcon size={18} style="color: var(--text-secondary);" />
        <span>View media</span>
      </button>
    </div>
  </div>
{/if}

<style>
  /* === PREMIUM HEADER === */
  .header-glass {
    background: var(--glass-bg);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 1px 0 var(--border-subtle), 0 4px 16px rgba(0,0,0,0.04);
    z-index: 50;
    position: relative;
  }

  .header-inner {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    height: 60px;
    min-height: 60px;
  }

  .h-btn {
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md, 12px);
    color: var(--text-primary);
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    border: none;
    background: transparent;
    cursor: pointer;
  }
  .h-btn:active { transform: scale(0.88); background: var(--input-bg); }

  .header-center {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 4px 8px;
    border-radius: var(--radius-md, 12px);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }
  .header-center:active { transform: scale(0.98); background: var(--input-bg); }

  .avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .online-ring {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--bg-surface, #fff);
    background: #22c55e;
    animation: statusRing 2s ease-in-out infinite;
  }

  @keyframes statusRing {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
    50% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0); }
  }

  .header-info { min-width: 0; }

  .header-name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  .header-sub {
    font-size: 12px;
    line-height: 1.3;
    color: var(--text-tertiary);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .typing-sub { color: var(--color-primary) !important; font-weight: 500; }

  .typing-dots {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 1px;
  }
  .td {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-primary);
    animation: typingBounce 1.4s ease-in-out infinite;
  }
  .td:nth-child(2) { animation-delay: 0.15s; }
  .td:nth-child(3) { animation-delay: 0.3s; }

  @keyframes typingBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  /* === PINNED BANNER === */
  .pin-banner {
    padding: 6px 12px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-bottom: 1px solid var(--border-subtle);
    animation: slideDown 250ms ease both;
  }

  .pin-inner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: var(--radius-md, 12px);
    background: var(--input-bg);
  }

  .pin-content { min-width: 0; flex: 1; }

  .pin-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
    margin: 0 0 2px 0;
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
    padding: 8px 0 12px;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  .msg-scroll::-webkit-scrollbar { width: 3px; }
  .msg-scroll::-webkit-scrollbar-track { background: transparent; }
  .msg-scroll::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.2); border-radius: 99px; }

  /* === DATE SEPARATOR === */
  .date-separator {
    display: flex;
    justify-content: center;
    margin: 16px 0 12px;
  }

  .date-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 12px;
    border-radius: 99px;
    background: var(--bg-elevated);
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }

  /* === EMPTY STATE === */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 32px 24px;
    animation: fadeIn 400ms ease both;
  }

  .empty-avatar-wrap {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    background: linear-gradient(135deg, rgba(5,150,105,0.08), rgba(16,185,129,0.04));
    animation: gentleFloat 4s ease-in-out infinite;
  }

  @keyframes gentleFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
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
    background: linear-gradient(135deg, #34d399, #059669);
  }

  .empty-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 6px 0;
  }

  .empty-desc {
    font-size: 14px;
    text-align: center;
    max-width: 240px;
    line-height: 1.5;
    color: var(--text-tertiary);
    margin: 0;
  }

  /* === TYPING AREA === */
  .typing-area {
    padding: 0 16px 4px;
    animation: fadeIn 200ms ease both;
  }

  /* === EDIT BAR === */
  .edit-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border-subtle);
    animation: fadeIn 200ms ease both;
  }

  .edit-accent {
    width: 3px;
    align-self: stretch;
    border-radius: 2px;
    background: var(--color-primary);
    flex-shrink: 0;
  }

  .edit-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .edit-input {
    flex: 1;
    min-height: 34px;
    max-height: 100px;
    padding: 6px 10px;
    border-radius: var(--radius-sm, 8px);
    outline: none;
    resize: none;
    font-size: 14px;
    line-height: 1.4;
    background: var(--input-bg);
    border: 1px solid var(--border-subtle);
    color: var(--text-primary);
  }
  .edit-input:focus {
    box-shadow: 0 0 0 2px var(--color-primary);
    border-color: var(--color-primary);
  }

  .edit-save {
    min-width: 44px;
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm, 8px);
    font-size: 12px;
    font-weight: 600;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border: none;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }
  .edit-save:active { transform: scale(0.9); }

  .edit-cancel {
    min-width: 34px;
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm, 8px);
    font-size: 12px;
    color: var(--text-tertiary);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }
  .edit-cancel:active { transform: scale(0.9); }

  /* === MENU OVERLAY === */
  .menu-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    animation: fadeIn 150ms ease both;
  }

  .menu-sheet {
    position: absolute;
    top: 68px;
    right: 12px;
    min-width: 180px;
    padding: 6px;
    border-radius: var(--radius-lg, 16px);
    background: var(--glass-bg);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: var(--glass-border);
    box-shadow: var(--shadow-float, 0 8px 32px rgba(0,0,0,0.12));
    z-index: 41;
    animation: scaleIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    min-height: 44px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    border-radius: var(--radius-md, 12px);
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }
  .menu-item:active { transform: scale(0.96); background: var(--input-bg); }
</style>