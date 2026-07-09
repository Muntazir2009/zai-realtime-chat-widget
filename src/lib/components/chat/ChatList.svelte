<script lang="ts">
  import { Plus, MessageSquare, X, Loader2, Search } from 'lucide-svelte';
  import ChatTile from './ChatTile.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import * as rtdb from '$lib/firebase/rtdb';

  let showNewChat = $state(false);
  let availableUsers: Array<{ id: string; username: string; displayName: string }> = $state([]);
  let isLoadingUsers = $state(false);

  async function loadAvailableUsers() {
    isLoadingUsers = true;
    try {
      const snap = await rtdb.get(await rtdb.ref('users'));
      if (!snap.exists()) return;
      const users: typeof availableUsers = [];
      snap.forEach((child: any) => {
        const u = child.val() as any;
        if (u.id !== authStore.user?.id) {
          users.push({ id: u.id, username: u.username, displayName: u.displayName });
        }
      });
      availableUsers = users;
    } finally {
      isLoadingUsers = false;
    }
  }

  function handleChatClick(chatId: string) {
    chatStore.openChat(chatId);
    uiStore.setView('conversation');
  }

  async function startNewChat(otherUserId: string) {
    try {
      const chatId = await chatStore.createDirectChat(otherUserId);
      chatStore.openChat(chatId);
      uiStore.setView('conversation');
      showNewChat = false;
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  }

  function handleShowNewChat() {
    showNewChat = !showNewChat;
    if (showNewChat) loadAvailableUsers();
  }

  let totalUnread = $derived(
    chatStore.sortedInbox.reduce((sum, { userChat }) => sum + (userChat.uc ?? 0), 0)
  );
</script>

<div class="chatlist-shell" style="background-color: var(--bg-page);">
  <!-- Premium Glass Header -->
  <header class="cl-header safe-top">
    <div class="cl-header-inner">
      <div class="cl-brand">
        <div class="cl-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <div class="cl-title-block">
          <h1 class="cl-title">Chats</h1>
          {#if chatStore.sortedInbox.length > 0}
            <div class="cl-subtitle-row">
              <span class="cl-subtitle">{chatStore.sortedInbox.length} conversation{chatStore.sortedInbox.length !== 1 ? 's' : ''}</span>
              {#if totalUnread > 0}
                <span class="cl-unread-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
              {/if}
            </div>
          {/if}
        </div>
      </div>
      <button class="cl-new-btn" onclick={handleShowNewChat} aria-label="New chat">
        <Plus size={21} />
      </button>
    </div>
  </header>

  <!-- New Chat Sheet -->
  {#if showNewChat}
    <div class="newchat-sheet">
      <div class="newchat-inner glass">
        <div class="newchat-header">
          <p class="newchat-title">Start a conversation</p>
          <button class="newchat-close" onclick={() => (showNewChat = false)} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        {#if isLoadingUsers}
          <div class="newchat-loading">
            <Loader2 size={18} class="animate-spin" style="color: var(--text-tertiary);" />
            <span style="color: var(--text-tertiary);">Loading...</span>
          </div>
        {:else if availableUsers.length === 0}
          <div class="newchat-empty">
            <span style="color: var(--text-tertiary);">No users found</span>
          </div>
        {:else}
          {#each availableUsers as user (user.id)}
            <button
              class="newchat-user"
              onclick={() => startNewChat(user.id)}
              onkeydown={(e) => e.key === 'Enter' && startNewChat(user.id)}
            >
              <div class="newchat-avatar">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div class="newchat-info">
                <p class="newchat-name">{user.displayName}</p>
                <p class="newchat-handle">@{user.username}</p>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Chat List -->
  <div class="cl-scroll">
    {#if chatStore.sortedInbox.length === 0}
      <div class="cl-empty">
        <div class="cl-empty-icon">
          <MessageSquare size={36} />
        </div>
        <p class="cl-empty-title">No conversations yet</p>
        <p class="cl-empty-desc">
          Tap <span class="cl-empty-plus">+</span> to start your first chat
        </p>
      </div>
    {:else}
      {#each chatStore.sortedInbox as { chatId, userChat, meta } (chatId)}
        <ChatTile
          {chatId}
          chatMeta={meta}
          {userChat}
          otherUser={meta ? (chatStore.getOtherParticipant(meta) ?? null) : null}
          isActive={chatStore.activeChatId === chatId}
          onclick={handleChatClick}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .chatlist-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* === HEADER === */
  .cl-header {
    background: var(--glass-bg);
    backdrop-filter: blur(24px) saturate(190%);
    -webkit-backdrop-filter: blur(24px) saturate(190%);
    box-shadow: 0 0.5px 0 var(--border-subtle), 0 4px 24px rgba(0,0,0,0.03);
    z-index: 50;
    position: relative;
    flex-shrink: 0;
  }

  .cl-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 58px;
    min-height: 58px;
  }

  .cl-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .cl-logo {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #059669, #10b981);
    box-shadow: 0 2px 8px rgba(5, 150, 105, 0.25);
  }

  .cl-title-block {}

  .cl-title {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .cl-subtitle-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 1px;
  }

  .cl-subtitle {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1;
  }

  .cl-unread-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 1px 4px rgba(5, 150, 105, 0.3);
  }

  .cl-new-btn {
    min-width: 40px;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md, 12px);
    color: var(--text-secondary);
    border: none;
    background: transparent;
    cursor: pointer;
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease, color 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .cl-new-btn:active { transform: scale(0.88); background: var(--input-bg); }

  /* === NEW CHAT SHEET === */
  .newchat-sheet {
    padding: 0 12px 8px;
    animation: sheetIn 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .newchat-inner {
    border-radius: var(--radius-lg, 16px);
    padding: 12px;
    overflow: hidden;
  }

  .newchat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding: 0 4px;
  }

  .newchat-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-tertiary);
    margin: 0;
  }

  .newchat-close {
    min-width: 28px;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--text-tertiary);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
  }
  .newchat-close:active { transform: scale(0.85); }

  .newchat-user {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    min-height: 46px;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
    text-align: left;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .newchat-user:active { transform: scale(0.98); background: var(--input-bg); }

  .newchat-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: 700;
    font-size: 14px;
    color: white;
    background: linear-gradient(135deg, #34d399, #059669);
    box-shadow: 0 2px 6px rgba(5, 150, 105, 0.2);
  }

  .newchat-info { min-width: 0; }

  .newchat-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .newchat-handle {
    font-size: 12px;
    color: var(--text-tertiary);
    margin: 0;
  }

  .newchat-loading,
  .newchat-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px;
    font-size: 14px;
  }

  /* === CHAT LIST SCROLL === */
  .cl-scroll {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 80px;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  .cl-scroll::-webkit-scrollbar { width: 0px; }

  /* === EMPTY STATE === */
  .cl-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 24px 24px;
    animation: fadeIn 400ms ease both;
  }

  .cl-empty-icon {
    width: 80px;
    height: 80px;
    border-radius: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    background: linear-gradient(135deg, rgba(5,150,105,0.1), rgba(16,185,129,0.04));
    color: var(--color-primary);
    opacity: 0.6;
    animation: gentleFloat 4s ease-in-out infinite;
  }

  .cl-empty-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 6px 0;
  }

  .cl-empty-desc {
    font-size: 14px;
    text-align: center;
    max-w: 240px;
    line-height: 1.5;
    color: var(--text-tertiary);
    margin: 0;
  }

  .cl-empty-plus {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 700;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    vertical-align: middle;
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sheetIn {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes gentleFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
</style>