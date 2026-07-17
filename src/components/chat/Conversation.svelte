<script lang="ts">
  import { ChevronLeft, MoreVertical, Phone, Video } from 'lucide-svelte';
  import MessageBubble from './MessageBubble.svelte';
  import InputBar from './InputBar.svelte';
  import ReplyPreview from './ReplyPreview.svelte';
  import TypingIndicator from '$lib/components/indicators/TypingIndicator.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import OnlinePill from '$lib/components/indicators/OnlinePill.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { authStore } from '$lib/stores/auth.svelte';

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

  // Auto-scroll on new messages
  $effect(() => {
    // Track messages length to trigger scroll
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

  function handleReply(msg: any) {
    uiStore.setReplyTo(msg);
  }
</script>

<div class="flex flex-col h-full" style="background-color: var(--bg-page);">
  <!-- Header -->
  <header class="glass-header safe-top flex items-center gap-3 px-3" style="height: 56px; min-height: 56px; z-index: 50;">
    <!-- Back -->
    <button
      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring -ml-1"
      style="color: var(--text-primary);"
      onclick={goBack}
      aria-label="Back to chats"
    >
      <ChevronLeft size={24} />
    </button>

    <!-- Avatar + Info -->
    <button class="flex items-center gap-2.5 flex-1 min-w-0" onclick={() => {}}>
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
          <p class="text-xs" style="color: var(--color-primary);">typing...</p>
        {:else if otherPresence}
          <OnlinePill status={otherPresence.status} lastSeen={otherPresence.lastSeen} />
        {/if}
      </div>
    </button>

    <!-- Actions -->
    <button class="min-w-[44px] min-h-[44px] flex items-center justify-center" style="color: var(--text-secondary);" aria-label="Voice call">
      <Phone size={20} />
    </button>
    <button class="min-w-[44px] min-h-[44px] flex items-center justify-center" style="color: var(--text-secondary);" aria-label="Video call">
      <Video size={20} />
    </button>
    <button
      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)]"
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
        <p class="text-sm" style="color: var(--text-tertiary);">
          No messages yet. Say hello!
        </p>
      </div>
    {:else}
      {#each chatStore.messages as msg (msg.id)}
        <MessageBubble
          {msg}
          isOwn={msg.sid === authStore.user?.id}
          showAvatar={!msg.isOwn}
          senderName={chatStore.userDict.get(msg.sid)?.displayName}
          onReply={handleReply}
        />
      {/each}
    {/if}
  </div>

  <!-- Typing indicator (always mounted for debounce) -->
  <div class="px-4 pb-1">
    <TypingIndicator usernames={typingNames} />
  </div>

  <!-- Reply Preview -->
  {#if uiStore.replyTo}
    <ReplyPreview
      message={uiStore.replyTo}
      senderName={chatStore.userDict.get(uiStore.replyTo.sid)?.displayName ?? 'Unknown'}
      onCancel={() => uiStore.setReplyTo(null)}
    />
  {/if}

  <!-- Input Bar -->
  <InputBar onSend={handleSend} />
</div>