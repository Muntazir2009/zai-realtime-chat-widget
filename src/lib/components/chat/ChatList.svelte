<script lang="ts">
  import { Search, Plus, MessageSquare } from 'lucide-svelte';
  import ChatTile from './ChatTile.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { themeManager } from '$lib/managers/ThemeManager.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import * as rtdb from '$lib/firebase/rtdb';

  let searchQuery = $state('');
  let showNewChat = $state(false);
  let availableUsers: Array<{ id: string; username: string; displayName: string }> = $state([]);

  async function loadAvailableUsers() {
    const snap = await rtdb.get(rtdb.ref('users'));
    if (!snap.exists()) return;
    const users: typeof availableUsers = [];
    snap.forEach((child) => {
      const u = child.val() as any;
      if (u.id !== authStore.user?.id) {
        users.push({ id: u.id, username: u.username, displayName: u.displayName });
      }
    });
    availableUsers = users;
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

  function toggleTheme() {
    themeManager.cycleTheme();
  }

  function handleShowNewChat() {
    showNewChat = !showNewChat;
    if (showNewChat) loadAvailableUsers();
  }
</script>

<div class="flex flex-col h-full" style="background-color: var(--bg-page);">
  <!-- Header -->
  <header class="glass-header safe-top flex items-center justify-between px-4" style="height: 56px; min-height: 56px; z-index: 50;">
    <h1 class="text-lg font-bold" style="color: var(--text-primary);">Chats</h1>
    <div class="flex items-center gap-1">
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring"
        style="color: var(--text-secondary);"
        onclick={toggleTheme}
        aria-label="Toggle theme"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2"></path><path d="M12 20v2"></path>
          <path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path>
          <path d="M2 12h2"></path><path d="M20 12h2"></path>
          <path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>
        </svg>
      </button>
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring"
        style="color: var(--text-secondary);"
        onclick={handleShowNewChat}
        aria-label="New chat"
      >
        <Plus size={22} />
      </button>
    </div>
  </header>

  <!-- Search -->
  <div class="px-4 pt-3 pb-2">
    <div class="relative">
      <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2" style="color: var(--text-tertiary);" />
      <input
        type="text"
        placeholder="Search conversations..."
        class="glass-input w-full min-h-[44px] pl-9 pr-4 rounded-[var(--radius-md)] outline-none text-sm"
        style="color: var(--text-primary);"
        bind:value={searchQuery}
      />
    </div>
  </div>

  <!-- New Chat Sheet -->
  {#if showNewChat}
    <div class="animate-slide-up px-4 pb-3">
      <div class="glass rounded-[var(--radius-md)] p-3">
        <p class="text-xs font-semibold mb-2 px-1" style="color: var(--text-tertiary);">Start a conversation</p>
        {#each availableUsers as user (user.id)}
          <button
            class="w-full flex items-center gap-3 px-2 py-2.5 rounded-[var(--radius-sm)] transition-spring text-left"
            style="min-height: 48px;"
            onclick={() => startNewChat(user.id)}
            onkeydown={(e) => e.key === 'Enter' && startNewChat(user.id)}
          >
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm"
              style="background: linear-gradient(135deg, #34d399, #059669);"
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">{user.displayName}</p>
              <p class="text-xs" style="color: var(--text-tertiary);">@{user.username}</p>
            </div>
          </button>
        {:else}
          <p class="text-sm text-center py-4" style="color: var(--text-tertiary);">Loading users...</p>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Chat List -->
  <div class="flex-1 overflow-y-auto custom-scrollbar">
    {#if chatStore.filteredInbox.length === 0}
      <div class="flex flex-col items-center justify-center px-8 pt-16 animate-fade-in">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style="background: var(--input-bg);">
          <MessageSquare size={32} style="color: var(--text-tertiary);" />
        </div>
        <p class="text-base font-medium" style="color: var(--text-secondary);">No conversations yet</p>
        <p class="text-sm text-center mt-1" style="color: var(--text-tertiary);">
          Tap <span class="font-semibold">+</span> to start chatting
        </p>
      </div>
    {:else}
      {#each chatStore.filteredInbox as { chatId, userChat, meta } (chatId)}
        <ChatTile
          {chatId}
          chatMeta={meta!}
          {userChat}
          otherUser={chatStore.getOtherParticipant(meta!)}
          isActive={chatStore.activeChatId === chatId}
          onclick={handleChatClick}
        />
      {/each}
    {/if}
  </div>
</div>