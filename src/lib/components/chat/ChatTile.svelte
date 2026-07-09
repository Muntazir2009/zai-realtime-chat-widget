<script lang="ts">
  import type { ChatMeta, UserChat, User } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import { Clock, Camera } from 'lucide-svelte';

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

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function lastMessagePreview(): string {
    const lm = chatMeta.lm;
    if (!lm) return 'No messages yet';
    if (lm.startsWith('📷')) return 'Photo';
    return lm;
  }
</script>

<button
  class="w-full flex items-center gap-3 px-4 transition-spring text-left border-b"
  style="
    min-height: 76px;
    background: {pressed ? 'var(--bg-elevated)' : isActive ? 'var(--bg-elevated)' : 'transparent'};
    border-color: var(--border-subtle);
  "
  onclick={handleTap}
  onmouseenter={(e) => { if (!pressed && !isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)'; }}
  onmouseleave={(e) => { if (!pressed && !isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
  aria-label="Open chat with {otherUser?.displayName || 'Unknown'}"
>
  <!-- Avatar with online dot -->
  <div class="relative flex-shrink-0">
    <Avatar
      username={otherUser?.username || '?'}
      size="md"
      status={otherUser?.status}
      avatarUrl={otherUser?.avatarUrl}
    />
    {#if otherUser?.status === 'online'}
      <span
        class="absolute bottom-0 right-0 block rounded-full border-2"
        style="
          width: 12px;
          height: 12px;
          background: var(--color-success, #22c55e);
          border-color: var(--bg-primary, #fff);
        "
        aria-label="Online"
      ></span>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 min-w-0">
    <div class="flex items-center justify-between gap-2">
      <span class="font-semibold text-[15px] truncate" style="color: var(--text-primary);">
        {otherUser?.displayName || 'Unknown'}
      </span>
      <span class="text-xs flex-shrink-0 flex items-center gap-1" style="color: var(--text-tertiary);">
        <Clock size={12} />
        {chatMeta.ts ? formatTime(chatMeta.ts) : ''}
      </span>
    </div>
    <div class="flex items-center justify-between gap-2 mt-1">
      <p class="text-sm truncate flex items-center gap-1" style="color: var(--text-secondary);">
        {#if chatMeta.lm?.startsWith('📷')}
          <Camera size={14} class="flex-shrink-0" style="color: var(--text-tertiary);" />
        {/if}
        {lastMessagePreview()}
      </p>
      {#if userChat.uc > 0}
        <span
          class="inline-flex items-center justify-center flex-shrink-0 rounded-full font-semibold"
          style="
            min-width: 22px;
            min-height: 22px;
            padding: 0 7px;
            background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, #6366f1));
            color: var(--color-primary-foreground);
            font-size: 11px;
            box-shadow: 0 1px 3px color-mix(in srgb, var(--color-primary) 40%, transparent);
          "
        >
          {userChat.uc > 99 ? '99+' : userChat.uc}
        </span>
      {/if}
    </div>
  </div>
</button>