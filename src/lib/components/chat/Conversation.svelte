<script lang="ts">
  import { ChevronLeft, MoreVertical, Clock, Image as ImageIcon, Pin, X } from 'lucide-svelte';
  import MessageBubble from './MessageBubble.svelte';
  import Lightbox from '$lib/components/media/Lightbox.svelte';
  import MessageContextMenu from './MessageContextMenu.svelte';
  import InputBar from './InputBar.svelte';
  import ReplyPreview from './ReplyPreview.svelte';
  import ScrollToBottom from './ScrollToBottom.svelte';
  import TypingIndicator from '$lib/components/indicators/TypingIndicator.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import OnlinePill from '$lib/components/indicators/OnlinePill.svelte';
  import ParticleRain from '$lib/components/effects/ParticleRain.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import type { Message } from '$lib/types/index';
  import { format, isToday, isYesterday, startOfDay } from 'date-fns';

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

  // Derived: the "other" user
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

  // Pinned messages sorted by timestamp
  let sortedPinned = $derived.by(() => {
    return Array.from(chatStore.pinnedMessages.entries())
      .sort((a, b) => b[1].ts - a[1].ts)
      .map(([id, msg]) => ({ id, msg }));
  });

  // Group messages by date
  let messageGroups = $derived.by(() => {
    const groups: Array<{ date: string; isToday: boolean; isYesterday: boolean; messages: typeof chatStore.messages }> = [];
    let currentDate = '';

    for (const msg of chatStore.messages) {
      const msgDate = format(startOfDay(msg.ts), 'yyyy-MM-dd');
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({
          date: msgDate,
          isToday: isToday(msg.ts),
          isYesterday: isYesterday(msg.ts),
          messages: [],
        });
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

  // Get reply preview message from messages array
  function getReplyMessage(msg: Message): Message | null {
    if (!msg.rid) return null;
    return chatStore.messages.find(m => m.id === msg.rid) ?? null;
  }

  // Auto-scroll on new messages
  $effect(() => {
    const len = chatStore.messages.length;
    if (len > 0 && messagesContainer) {
      requestAnimationFrame(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      });
    }
  });

  function goBack() {
    chatStore.closeChat();
    uiStore.setView('chatList');
  }

  function handleSend(content: string) {
    if (!chatStore.activeChatId) return;

    // Easter egg detection
    if (content === '❤️' || content === 'heart rain') {
      triggerHeartRain = !triggerHeartRain;
    } else if (content === '💋' || content === 'kiss rain') {
      triggerKissRain = !triggerKissRain;
    }

    const replyToId = uiStore.replyTo?.id;
    chatStore.sendMessage(chatStore.activeChatId, content, replyToId);
    uiStore.setReplyTo(null);
  }

  async function handleImageSend(imageUrl: string) {
    if (!chatStore.activeChatId) return;
    await chatStore.sendImageMessage(chatStore.activeChatId, imageUrl);
  }

  function handleReply(msg: Message) {
    uiStore.setReplyTo(msg);
  }

  function handleSwipeReply(msg: Message) {
    uiStore.setReplyTo(msg);
    toastStore.success('Swipe to reply');
  }

  function handleLongPress(msg: Message) {
    contextMenuMsg = msg;
    showContextMenu = true;
  }

  function handleCopyText(text: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        toastStore.success('Copied to clipboard');
      }).catch(() => {
        toastStore.error('Failed to copy');
      });
    }
  }

  async function handleDeleteMessage(msg: Message) {
    if (!chatStore.activeChatId) return;
    try {
      await chatStore.deleteMessage(chatStore.activeChatId, msg.id);
      toastStore.success('Message deleted');
    } catch (err) {
      toastStore.error('Failed to delete message');
    }
  }

  async function handlePinMessage(msg: Message) {
    if (!chatStore.activeChatId) return;
    await chatStore.togglePin(chatStore.activeChatId, msg);
  }

  async function handleStarMessage(msg: Message) {
    if (!chatStore.activeChatId) return;
    await chatStore.toggleStar(chatStore.activeChatId, msg);
  }

  function handleEditMessage(msg: Message) {
    editingMsg = msg;
    editText = msg.c;
  }

  async function saveEdit() {
    if (!chatStore.activeChatId || !editingMsg) return;
    if (!editText.trim()) {
      toastStore.error('Message cannot be empty');
      return;
    }
    await chatStore.editMessage(chatStore.activeChatId, editingMsg.id, editText.trim());
    editingMsg = null;
    editText = '';
  }

  function cancelEdit() {
    editingMsg = null;
    editText = '';
  }

  function handleImageTap(imageUrl: string, caption?: string) {
    const imageMessages = chatStore.messages.filter(m => m.t === 'image' && m.mu);
    lightboxImages = imageMessages.map(m => ({ url: m.mu!, caption: m.c || undefined }));
    lightboxIndex = lightboxImages.findIndex(i => i.url === imageUrl);
    if (lightboxIndex < 0) lightboxIndex = 0;
    showLightbox = true;
  }

  function handleReaction(msg: Message, emoji: string) {
    if (chatStore.activeChatId) {
      // Easter egg: detect heart/kiss emoji reactions
      if (emoji === '❤️') triggerHeartRain = !triggerHeartRain;
      if (emoji === '💋') triggerKissRain = !triggerKissRain;
      chatStore.sendMessage(chatStore.activeChatId, emoji);
    }
  }

  function handleStickerSelect(sticker: string) {
    if (chatStore.activeChatId) {
      chatStore.sendMessage(chatStore.activeChatId, sticker);
      // Heart sticker triggers rain
      if (sticker === '❤️' || sticker === '💕' || sticker === '💗') {
        triggerHeartRain = !triggerHeartRain;
      }
      if (sticker === '💋' || sticker === '😘') {
        triggerKissRain = !triggerKissRain;
      }
    }
  }

  function handleGifSelect(gifUrl: string) {
    if (chatStore.activeChatId) {
      chatStore.sendImageMessage(chatStore.activeChatId, gifUrl, 'GIF');
    }
  }
</script>

<div class="flex flex-col h-full relative" style="background-color: var(--bg-page);">
  <!-- Easter Egg Particle Effects -->
  <ParticleRain type="heart" trigger={triggerHeartRain} />
  <ParticleRain type="kiss" trigger={triggerKissRain} />

  <!-- Header -->
  <header class="glass-header safe-top flex items-center gap-3 px-3" style="height: 60px; min-height: 60px; z-index: 50;">
    <button
      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-90 -ml-1"
      style="color: var(--text-primary);"
      onclick={goBack}
      aria-label="Back to chats"
    >
      <ChevronLeft size={24} />
    </button>

    <button class="flex items-center gap-2.5 flex-1 min-w-0 rounded-[var(--radius-md)] px-1 py-1 -ml-1 transition-spring active:scale-[0.98]" onclick={() => {}}>
      <Avatar
        username={otherUser?.username ?? '?'}
        size="sm"
        status={otherPresence?.status ?? otherUser?.status}
        avatarUrl={otherUser?.avatarUrl}
      />
      <div class="min-w-0 text-left">
        <p class="text-sm font-semibold truncate" style="color: var(--text-primary);">
          {otherUser?.displayName ?? 'Unknown'}
        </p>
        {#if typingNames.length > 0}
          <p class="text-xs font-medium" style="color: var(--color-primary);">typing...</p>
        {:else if otherPresence?.status === 'online'}
          <p class="text-xs font-medium" style="color: var(--color-primary);">Online</p>
        {:else if otherPresence}
          <OnlinePill status={otherPresence.status} lastSeen={otherPresence.lastSeen} />
        {:else}
          <p class="text-xs" style="color: var(--text-tertiary);">Tap for info</p>
        {/if}
      </div>
    </button>

    <button
      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-90"
      style="color: var(--text-secondary);"
      onclick={() => (showMenu = !showMenu)}
      aria-label="More options"
    >
      <MoreVertical size={20} />
    </button>
  </header>

  <!-- Pinned Messages Banner -->
  {#if sortedPinned.length > 0}
    <div class="px-3 py-2 animate-slide-down" style="background: var(--glass-bg); backdrop-filter: var(--glass-blur); border-bottom: 1px solid var(--border-subtle);">
      <div class="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-md)]" style="background: var(--input-bg);">
        <Pin size={14} style="color: var(--color-primary);" />
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style="color: var(--text-tertiary);">
            Pinned Message{sortedPinned.length > 1 ? 's' : ''}
          </p>
          <p class="text-sm truncate" style="color: var(--text-primary);">
            {sortedPinned[0].msg.t === 'image' ? '📷 Photo' : sortedPinned[0].msg.c.slice(0, 80)}
          </p>
        </div>
        {#if sortedPinned.length > 1}
          <span class="text-xs font-medium px-2 py-0.5 rounded-full" style="background: var(--bg-elevated); color: var(--text-secondary);">
            {sortedPinned.length}
          </span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Messages -->
  <div
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 relative"
  >
    {#if chatStore.messages.length === 0}
      <div class="flex flex-col items-center justify-center h-full animate-fade-in">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style="background: linear-gradient(135deg, rgba(5, 150, 105, 0.1), rgba(16, 185, 129, 0.05));">
          {#if otherUser}
            <Avatar username={otherUser.username} size="lg" />
          {:else}
            <div class="w-14 h-14 rounded-full flex items-center justify-center font-bold text-white text-2xl" style="background: linear-gradient(135deg, #34d399, #059669);">?</div>
          {/if}
        </div>
        <p class="text-sm font-semibold mb-1" style="color: var(--text-primary);">
          {otherUser?.displayName || 'Start the conversation'}
        </p>
        <p class="text-sm text-center max-w-[240px] leading-relaxed" style="color: var(--text-tertiary);">
          Say hello! Messages are delivered in real time.
        </p>
      </div>
    {:else}
      {#each messageGroups as group (group.date)}
        <div class="flex items-center justify-center my-4 animate-fade-in">
          <div class="flex items-center gap-2 px-3 py-1 rounded-full" style="background: var(--bg-elevated);">
            <Clock size={12} style="color: var(--text-tertiary);" />
            <span class="text-[11px] font-medium" style="color: var(--text-tertiary);">
              {formatDateLabel(group.date, group.isToday, group.isYesterday)}
            </span>
          </div>
        </div>

        {#each group.messages as msg, idx (msg.id)}
          {@const isOwn = msg.sid === authStore.user?.id}
          {@const prevMsg = idx > 0 ? group.messages[idx - 1] : null}
          {@const nextMsg = idx < group.messages.length - 1 ? group.messages[idx + 1] : null}
          {@const isConsecutive = prevMsg?.sid === msg.sid}
          {@const isLastInGroup = nextMsg?.sid !== msg.sid}
          {@const showAv = !isOwn && isLastInGroup}
          <MessageBubble
            {msg}
            {isOwn}
            showAvatar={showAv}
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
    <div class="px-4 pb-1">
      <TypingIndicator usernames={typingNames} />
    </div>
  {/if}

  <!-- Edit Message Bar -->
  {#if editingMsg}
    <div class="flex items-center gap-2 px-4 py-2.5 animate-fade-in" style="background: var(--bg-elevated); border-top: 1px solid var(--border-subtle);">
      <div class="w-[3px] self-stretch rounded-full flex-shrink-0" style="background: var(--color-primary);"></div>
      <div class="flex-1 min-w-0 flex items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--color-primary);">Edit</span>
        <textarea
          bind:value={editText}
          rows={1}
          class="glass-input flex-1 min-h-[36px] max-h-[100px] px-3 py-1.5 rounded-[var(--radius-sm)] outline-none resize-none text-sm"
          style="color: var(--text-primary);"
        ></textarea>
      </div>
      <button
        class="min-w-[44px] min-h-[36px] flex items-center justify-center rounded-[var(--radius-sm)] font-semibold text-xs transition-spring active:scale-90 flex-shrink-0"
        style="background: var(--color-primary); color: var(--color-primary-foreground);"
        onclick={saveEdit}
      >
        Save
      </button>
      <button
        class="min-w-[44px] min-h-[36px] flex items-center justify-center rounded-[var(--radius-sm)] transition-spring active:scale-90 flex-shrink-0"
        style="color: var(--text-tertiary);"
        onclick={cancelEdit}
        aria-label="Cancel edit"
      >
        <X size={16} />
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
    <Lightbox
      images={lightboxImages}
      initialIndex={lightboxIndex}
      onClose={() => (showLightbox = false)}
    />
  {/if}

  <!-- Message Context Menu -->
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
  <div
    class="fixed inset-0 z-40 animate-fade-in"
    style="background: var(--overlay-bg);"
    onclick={() => (showMenu = false)}
    onkeydown={(e) => e.key === 'Escape' && (showMenu = false)}
    role="button"
    tabindex="-1"
    aria-label="Close menu"
  >
    <div class="absolute top-[68px] right-4 glass rounded-[var(--radius-lg)] py-1.5 animate-scale-in min-w-[180px]" style="z-index: 41;">
      <button
        class="w-full flex items-center gap-3 px-4 py-3 text-left transition-spring active:scale-[0.98]"
        style="color: var(--text-primary); min-height: 44px;"
        onclick={() => { showMenu = false; }}
      >
        <ImageIcon size={18} style="color: var(--text-secondary);" />
        <span class="text-sm">View media</span>
      </button>
    </div>
  </div>
{/if}