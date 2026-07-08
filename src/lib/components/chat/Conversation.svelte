<script lang="ts">
  import { ChevronLeft, MoreVertical, Phone, Video, Clock, Image as ImageIcon } from 'lucide-svelte';
  import MessageBubble from './MessageBubble.svelte';
  import InputBar from './InputBar.svelte';
  import ReplyPreview from './ReplyPreview.svelte';
  import TypingIndicator from '$lib/components/indicators/TypingIndicator.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import OnlinePill from '$lib/components/indicators/OnlinePill.svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { format, isToday, isYesterday, isSameDay, startOfDay } from 'date-fns';

  let messagesContainer: HTMLDivElement | undefined = $state();
  let showMenu = $state(false);

  // Derived: the "other" user in this direct chat
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
    const replyToId = uiStore.replyTo?.id;
    chatStore.sendMessage(chatStore.activeChatId, content, replyToId);
    uiStore.setReplyTo(null);
  }

  async function handleImageSend(imageUrl: string) {
    if (!chatStore.activeChatId) return;
    // Send as image message
    await chatStore.sendImageMessage(chatStore.activeChatId, imageUrl);
  }

  function handleReply(msg: any) {
    uiStore.setReplyTo(msg);
  }
</script>

<div class="flex flex-col h-full" style="background-color: var(--bg-page);">
  <!-- Header -->
  <header class="glass-header safe-top flex items-center gap-3 px-3" style="height: 60px; min-height: 60px; z-index: 50;">
    <!-- Back -->
    <button
      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-90 -ml-1"
      style="color: var(--text-primary);"
      onclick={goBack}
      aria-label="Back to chats"
    >
      <ChevronLeft size={24} />
    </button>

    <!-- Avatar + Info -->
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
        {:else if otherPresence}
          <OnlinePill status={otherPresence.status} lastSeen={otherPresence.lastSeen} />
        {:else}
          <p class="text-xs" style="color: var(--text-tertiary);">Tap for info</p>
        {/if}
      </div>
    </button>

    <!-- Actions -->
    <button class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-90" style="color: var(--text-secondary);" aria-label="Voice call">
      <Phone size={20} />
    </button>
    <button class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-90" style="color: var(--text-secondary);" aria-label="Video call">
      <Video size={20} />
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

  <!-- Messages -->
  <div
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto custom-scrollbar px-4 py-3"
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
          Say hello! Your messages are end-to-end secure.
        </p>
      </div>
    {:else}
      {#each messageGroups as group (group.date)}
        <!-- Date Separator -->
        <div class="flex items-center justify-center my-4 animate-fade-in">
          <div class="flex items-center gap-2 px-3 py-1 rounded-full" style="background: var(--bg-elevated);">
            {#if group.isToday || group.isYesterday}
              <Clock size={12} style="color: var(--text-tertiary);" />
            {:else}
              <Clock size={12} style="color: var(--text-tertiary);" />
            {/if}
            <span class="text-[11px] font-medium" style="color: var(--text-tertiary);">
              {formatDateLabel(group.date, group.isToday, group.isYesterday)}
            </span>
          </div>
        </div>

        <!-- Messages in this date group -->
        {#each group.messages as msg (msg.id)}
          <MessageBubble
            {msg}
            isOwn={msg.sid === authStore.user?.id}
            showAvatar={!msg.isOwn}
            senderName={chatStore.userDict.get(msg.sid)?.displayName}
            onReply={handleReply}
          />
        {/each}
      {/each}
    {/if}
  </div>

  <!-- Typing indicator -->
  {#if typingNames.length > 0}
    <div class="px-4 pb-1">
      <TypingIndicator {typingNames} />
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
  <InputBar onSend={handleSend} onImageSend={handleImageSend} />
</div>

<!-- Menu Overlay -->
{#if showMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 animate-fade-in"
    style="background: var(--overlay-bg);"
    onclick={() => (showMenu = false)}
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