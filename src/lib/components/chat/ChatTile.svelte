<script lang="ts">
  import type { ChatMeta, UserChat, User } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import { Camera, Trash2, X } from 'lucide-svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { prefsStore } from '$lib/stores/prefs.svelte';
  import { draftStore } from '$lib/stores/draft.svelte';

  interface Props {
    chatId: string;
    chatMeta: ChatMeta | null;
    userChat: UserChat;
    otherUser: User | null;
    isActive: boolean;
    onclick?: (chatId: string) => void;
    style?: string;
  }

  let { chatId, chatMeta, userChat, otherUser, isActive = false, onclick, style = '' }: Props = $props();

  // Long press context menu
  let showContextMenu = $state(false);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  // Derived presence
  let presenceStatus = $derived.by(() => {
    if (!otherUser) return 'offline' as const;
    return chatStore.presence.get(otherUser.id)?.status ?? 'offline';
  });

  let isOnline = $derived(presenceStatus === 'online');
  let isAway = $derived(presenceStatus === 'away');

  function handleTap() {
    if (showContextMenu) {
      showContextMenu = false;
      return;
    }
    onclick?.(chatId);
  }

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Now';
    const d = new Date(ts);
    const hour12 = !prefsStore.use24HourFormat;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // Draft preview
  let draftText = $derived(draftStore.getDraft(chatId));
  let hasDraft = $derived(draftText.length > 0);

  function lastMessagePreview(): string {
    if (hasDraft) return draftText;
    if (!chatMeta) return 'No messages yet';
    const lm = chatMeta.lm;
    if (!lm) return 'No messages yet';
    if (lm.startsWith('📷')) return '📷 Photo';
    if (lm.startsWith('🎙')) return '🎙 Voice message';
    return lm;
  }

  const hasMediaPreview = $derived(
    !hasDraft &&
    ((chatMeta?.lm?.startsWith('📷') ?? false) || (chatMeta?.lm?.startsWith('🎙') ?? false))
  );

  function handleTouchStart() {
    longPressTimer = setTimeout(() => {
      showContextMenu = true;
    }, 500);
  }

  function handleTouchMove() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  function handleTouchEnd() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    showContextMenu = true;
  }

  async function handleDelete() {
    showContextMenu = false;
    await chatStore.deleteChat(chatId);
  }
</script>

<button
  class="tile"
  class:tile-active={isActive}
  style="min-height: 72px; {style}"
  onclick={handleTap}
  oncontextmenu={handleContextMenu}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  aria-label="Open chat with {otherUser?.displayName || 'Unknown'}"
>
  <div class="tile-avatar-wrap">
    <Avatar
      username={otherUser?.username || '?'}
      size="md"
      avatarUrl={otherUser?.avatarUrl}
      accentColor={otherUser?.accentColor}
      emojiStatus={otherUser?.emojiStatus}
    />
    <span class="tile-presence-dot" class:dot-online={isOnline} class:dot-away={isAway}></span>
  </div>

  <div class="tile-content">
    <div class="tile-top">
      <span class="tile-name">{otherUser?.displayName || 'Unknown'}</span>
      <span class="tile-time">{chatMeta?.ts ? formatTime(chatMeta.ts) : ''}</span>
    </div>
    <div class="tile-bottom">
      <p class="tile-preview" class:tile-preview-draft={hasDraft}>
        {#if hasDraft}
          <span class="tile-draft-label">Draft:</span>
        {:else if hasMediaPreview}
          <Camera size={13} class="tile-preview-icon" />
        {/if}
        {lastMessagePreview()}
      </p>
      {#if otherUser?.bio}
        <p class="tile-bio">{otherUser.bio}</p>
      {/if}
      {#if userChat.uc > 0}
        <span class="tile-badge">
          {userChat.uc > 99 ? '99+' : userChat.uc}
        </span>
      {/if}
    </div>
  </div>
</button>

<!-- Context menu -->
{#if showContextMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="tile-ctx-backdrop" onclick={() => (showContextMenu = false)}>
    <div class="tile-ctx-sheet" onclick={(e) => e.stopPropagation()}>
      <button class="tile-ctx-item tile-ctx-danger" onclick={() => { handleDelete(); }}>
        <Trash2 size={15} />
        <span>Delete chat</span>
      </button>
    </div>
  </div>
{/if}

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
    transition: background 150ms ease;
    animation: tileEnter 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
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

  /* Always-visible presence indicator */
  .tile-presence-dot {
    position: absolute;
    bottom: 0px;
    right: 0px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2.5px solid var(--bg-page);
    background: #9ca3af;
    box-shadow: 0 0 0 0 transparent;
    transition: background 300ms ease, box-shadow 300ms ease;
    z-index: 2;
  }

  .dot-online {
    background: #22c55e;
    box-shadow:
      0 0 0 0 rgba(34, 197, 94, 0.5),
      0 0 6px 1px rgba(34, 197, 94, 0.25);
    animation: dotPulseOnline 2.5s ease-in-out infinite;
  }

  .dot-away {
    background: #f59e0b;
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4);
    animation: dotPulseAway 3s ease-in-out infinite;
  }

  @keyframes dotPulseOnline {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5), 0 0 6px 1px rgba(34, 197, 94, 0.25); }
    50% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0), 0 0 8px 2px rgba(34, 197, 94, 0.15); }
  }

  @keyframes dotPulseAway {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
    50% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0); }
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

  .tile-preview-draft {
    color: var(--text-primary);
    font-weight: 500;
  }

  .tile-draft-label {
    color: var(--color-primary);
    font-weight: 600;
    flex-shrink: 0;
    margin-right: 1px;
  }

  .tile-preview-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  .tile-bio {
    font-size: 12px;
    color: var(--text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 2px 0 0;
    font-style: italic;
    opacity: 0.8;
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
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: 11px;
    font-weight: 700;
    box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary) 30%, transparent);
    line-height: 1;
  }

  /* === CONTEXT MENU === */
  .tile-ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: var(--overlay-bg);
    animation: ctxFadeIn 150ms ease both;
  }

  .tile-ctx-sheet {
    position: absolute;
    bottom: 16px;
    left: 16px;
    right: 16px;
    max-width: 280px;
    margin: 0 auto;
    padding: 6px;
    border-radius: var(--radius-lg, 16px);
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    animation: ctxScaleIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    z-index: 81;
  }

  .tile-ctx-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    min-height: 44px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    border-radius: var(--radius-md, 12px);
    cursor: pointer;
    transition: background 150ms ease;
    -webkit-tap-highlight-color: transparent;
    text-align: left;
  }
  .tile-ctx-item:active { background: var(--input-bg); }

  .tile-ctx-danger {
    color: var(--color-danger, #ef4444);
  }
  .tile-ctx-danger:active {
    background: color-mix(in srgb, var(--color-danger, #ef4444) 10%, transparent);
  }

  @keyframes ctxFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ctxScaleIn {
    from { opacity: 0; transform: scale(0.92) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes tileEnter {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
  }
</style>