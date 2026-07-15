<script lang="ts">
  import type { ChatMeta, UserChat, User } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';

  interface Props {
    chatId: string;
    chatMeta: ChatMeta;
    userChat: UserChat;
    otherUser: User | null;
    isActive: boolean;
    onclick?: (chatId: string) => void;
  }

  let { chatId, chatMeta, userChat, otherUser, isActive = false, onclick }: Props = $props();

  let pressed = $state(false);

  function handleTap() {
    pressed = true;
    onclick?.(chatId);
    setTimeout(() => (pressed = false), 150);
  }
</script>

<button
  class="w-full flex items-center gap-3 px-4 transition-spring text-left border-b"
  style="
    min-height: 72px;
    background: {pressed ? 'var(--bg-elevated)' : 'transparent'};
    border-color: var(--border-subtle);
  "
  onclick={handleTap}
  aria-label="Open chat with {otherUser?.displayName || 'Unknown'}"
>
  <!-- Avatar -->
  <Avatar
    username={otherUser?.username || '?'}
    size="md"
    status={otherUser?.status}
    avatarUrl={otherUser?.avatarUrl}
  />

  <!-- Content -->
  <div class="flex-1 min-w-0">
    <div class="flex items-center justify-between gap-2">
      <span class="font-semibold text-sm truncate" style="color: var(--text-primary);">
        {otherUser?.displayName || 'Unknown'}
      </span>
      <span class="text-xs flex-shrink-0" style="color: var(--text-tertiary);">
        {chatMeta.ts ? new Date(chatMeta.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
      </span>
    </div>
    <div class="flex items-center justify-between gap-2 mt-0.5">
      <p class="text-sm truncate" style="color: var(--text-secondary);">
        {chatMeta.lm || 'No messages yet'}
      </p>
      {#if userChat.uc > 0}
        <span
          class="inline-flex items-center justify-center flex-shrink-0 rounded-full font-medium"
          style="
            min-width: 20px;
            min-height: 20px;
            padding: 0 6px;
            background: var(--color-primary);
            color: var(--color-primary-foreground);
            font-size: 11px;
          "
        >
          {userChat.uc > 99 ? '99+' : userChat.uc}
        </span>
      {/if}
    </div>
  </div>
</button>