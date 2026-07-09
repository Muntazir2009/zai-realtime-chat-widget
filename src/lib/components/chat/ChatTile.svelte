<script lang="ts">
  import type { ChatMeta, UserChat, User } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import { Camera } from 'lucide-svelte';

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
    if (diff < 60_000) return 'Now';
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
  class="tile"
  class:tile-active={isActive}
  style="
    min-height: 72px;
    transform: scale({pressed ? '0.98' : '1'});
  "
  onclick={handleTap}
  aria-label="Open chat with {otherUser?.displayName || 'Unknown'}"
>
  <div class="tile-avatar-wrap">
    <Avatar
      username={otherUser?.username || '?'}
      size="md"
      avatarUrl={otherUser?.avatarUrl}
    />
  </div>

  <div class="tile-content">
    <div class="tile-top">
      <span class="tile-name">{otherUser?.displayName || 'Unknown'}</span>
      <span class="tile-time">{chatMeta.ts ? formatTime(chatMeta.ts) : ''}</span>
    </div>
    <div class="tile-bottom">
      <p class="tile-preview">
        {#if chatMeta.lm?.startsWith('📷')}
          <Camera size={13} class="tile-preview-icon" />
        {/if}
        {lastMessagePreview()}
      </p>
      {#if userChat.uc > 0}
        <span class="tile-badge">
          {userChat.uc > 99 ? '99+' : userChat.uc}
        </span>
      {/if}
    </div>
  </div>
</button>

<style>
  .tile {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    position: relative;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }

  .tile::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 72px;
    right: 16px;
    height: 1px;
    background: var(--border-subtle);
  }

  .tile:active { background: var(--input-bg); }
  .tile-active { background: var(--input-bg); }

  .tile-avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .tile-content {
    flex: 1;
    min-width: 0;
    padding: 10px 0;
  }

  .tile-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .tile-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tile-time {
    font-size: 12px;
    color: var(--text-tertiary);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .tile-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 3px;
  }

  .tile-preview {
    font-size: 14px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .tile-preview-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  .tile-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 20px;
    min-height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, #047857));
    color: var(--color-primary-foreground);
    font-size: 11px;
    font-weight: 700;
    box-shadow: 0 1px 4px rgba(5, 150, 105, 0.35);
    line-height: 1;
  }
</style>