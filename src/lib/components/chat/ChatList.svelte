<script lang="ts">
  import { Plus, MessageSquare, LogOut, Settings, X, Check, Moon, Sun, Smartphone, Loader2 } from 'lucide-svelte';
  import ChatTile from './ChatTile.svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { themeManager } from '$lib/managers/ThemeManager.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import * as rtdb from '$lib/firebase/rtdb';
  import type { ThemeMode } from '$lib/types/index';

  let showNewChat = $state(false);
  let availableUsers: Array<{ id: string; username: string; displayName: string }> = $state([]);
  let showSettings = $state(false);

  const themes: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: 'light', label: 'Light', icon: Sun },
    { mode: 'dark', label: 'Dark', icon: Moon },
    { mode: 'amoled', label: 'AMOLED', icon: Smartphone },
  ];

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

  function handleLogout() {
    chatStore.detachAllListeners();
    authStore.logout();
    uiStore.setView('auth');
    showSettings = false;
  }

  function handleShowNewChat() {
    showNewChat = !showNewChat;
    if (showNewChat) loadAvailableUsers();
  }

  function setTheme(mode: ThemeMode) {
    themeManager.setTheme(mode);
  }

  let totalUnread = $derived(
    chatStore.sortedInbox.reduce((sum, { userChat }) => sum + (userChat.uc ?? 0), 0)
  );
</script>

<div class="flex flex-col h-full" style="background-color: var(--bg-page);">
  <!-- Header -->
  <header class="glass-header safe-top flex items-center justify-between px-4" style="height: 60px; min-height: 60px; z-index: 50;">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #059669, #10b981);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </div>
      <div>
        <h1 class="text-lg font-bold leading-tight" style="color: var(--text-primary);">Chats</h1>
        {#if chatStore.sortedInbox.length > 0}
          <p class="text-[11px] leading-tight" style="color: var(--text-tertiary);">{chatStore.sortedInbox.length} conversation{chatStore.sortedInbox.length !== 1 ? 's' : ''}</p>
          {#if totalUnread > 0}
            <span
              class="inline-flex items-center justify-center rounded-full font-bold animate-badge-pulse"
              style="
                min-width: 18px;
                height: 18px;
                padding: 0 5px;
                font-size: 11px;
                line-height: 1;
                background: var(--color-primary);
                color: var(--color-primary-foreground);
                margin-left: 6px;
              "
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          {/if}
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-0.5">
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-90"
        style="color: var(--text-secondary);"
        onclick={() => (showSettings = true)}
        aria-label="Settings"
      >
        <Settings size={20} />
      </button>
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-90"
        style="color: var(--text-secondary);"
        onclick={handleShowNewChat}
        aria-label="New chat"
      >
        <Plus size={22} />
      </button>
    </div>
  </header>



  <!-- New Chat Sheet -->
  {#if showNewChat}
    <div class="animate-slide-up px-4 pb-3">
      <div class="glass rounded-[var(--radius-lg)] p-3 overflow-hidden">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Start a conversation</p>
          <button
            class="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full"
            style="color: var(--text-tertiary);"
            onclick={() => (showNewChat = false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {#each availableUsers as user (user.id)}
          <button
            class="w-full flex items-center gap-3 px-2 py-2.5 rounded-[var(--radius-sm)] transition-all duration-150 text-left hover:opacity-80 active:scale-[0.98]"
            style="min-height: 48px;"
            onclick={() => startNewChat(user.id)}
            onkeydown={(e) => e.key === 'Enter' && startNewChat(user.id)}
          >
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm shadow-sm"
              style="background: linear-gradient(135deg, #34d399, #059669);"
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium" style="color: var(--text-primary);">{user.displayName}</p>
              <p class="text-xs" style="color: var(--text-tertiary);">@{user.username}</p>
            </div>
          </button>
        {:else}
          <div class="flex flex-col items-center py-6">
            <div class="w-10 h-10 rounded-full flex items-center justify-center mb-2" style="background: var(--input-bg);">
              <Loader2 size={18} style="color: var(--text-tertiary);" class="animate-spin" />
            </div>
            <p class="text-sm" style="color: var(--text-tertiary);">Loading users...</p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Chat List -->
  <div class="flex-1 overflow-y-auto custom-scrollbar">
    {#if chatStore.sortedInbox.length === 0}
      <div class="flex flex-col items-center justify-center px-8 pt-20 animate-fade-in">
        <div class="w-20 h-20 rounded-3xl flex items-center justify-center mb-5" style="background: linear-gradient(135deg, rgba(5, 150, 105, 0.1), rgba(16, 185, 129, 0.05));">
          <MessageSquare size={36} style="color: var(--color-primary); opacity: 0.6;" />
        </div>
        <p class="text-base font-semibold mb-1" style="color: var(--text-primary);">No conversations yet</p>
        <p class="text-sm text-center max-w-[240px] leading-relaxed" style="color: var(--text-tertiary);">
          Tap <span class="inline-flex items-center justify-center w-5 h-5 rounded-md text-xs font-bold" style="background: var(--color-primary); color: var(--color-primary-foreground);">+</span> to start your first chat
        </p>
      </div>
    {:else}
      {#each chatStore.sortedInbox as { chatId, userChat, meta } (chatId)}
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

<!-- Settings Bottom Sheet -->
<BottomSheet open={showSettings} onClose={() => (showSettings = false)} title="Settings">
  <!-- Profile Card -->
  <div class="flex items-center gap-3 p-3 rounded-[var(--radius-md)] mb-4" style="background: var(--input-bg);">
    <div
      class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg flex-shrink-0 shadow-md"
      style="background: linear-gradient(135deg, #34d399, #059669);"
    >
      {authStore.user?.displayName?.charAt(0).toUpperCase() || '?'}
    </div>
    <div class="min-w-0 flex-1">
      <p class="font-semibold text-sm truncate" style="color: var(--text-primary);">
        {authStore.user?.displayName || 'Unknown'}
      </p>
      <p class="text-xs" style="color: var(--text-tertiary);">
        @{authStore.user?.username || 'unknown'}
      </p>
    </div>
    <div class="flex items-center gap-1 rounded-full px-2.5 py-1" style="background: rgba(34, 197, 94, 0.15);">
      <span class="w-2 h-2 rounded-full" style="background: #22c55e;"></span>
      <span class="text-xs font-medium" style="color: #22c55e;">Online</span>
    </div>
  </div>

  <!-- Theme Section -->
  <p class="text-xs font-semibold uppercase tracking-wider mb-3" style="color: var(--text-tertiary);">Appearance</p>
  <div class="flex gap-2 mb-5">
    {#each themes as theme}
      <button
        class="flex-1 flex flex-col items-center gap-2 p-3 rounded-[var(--radius-md)] transition-all duration-200 active:scale-95"
        style="
          background: {themeManager.currentTheme === theme.mode ? 'var(--color-primary)' : 'var(--input-bg)'};
          color: {themeManager.currentTheme === theme.mode ? 'var(--color-primary-foreground)' : 'var(--text-secondary)'};
        "
        onclick={() => setTheme(theme.mode)}
      >
        <theme.icon size={20} />
        <span class="text-xs font-medium">{theme.label}</span>
        {#if themeManager.currentTheme === theme.mode}
          <div class="w-4 h-4 rounded-full flex items-center justify-center" style="background: var(--color-primary-foreground);">
            <Check size={10} style="color: var(--color-primary);" />
          </div>
        {:else}
          <div class="w-4 h-4"></div>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Logout -->
  <button
    class="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-[var(--radius-md)] font-semibold text-sm transition-all duration-200 active:scale-95"
    style="background: rgba(239, 68, 68, 0.1); color: var(--color-danger);"
    onclick={handleLogout}
  >
    <LogOut size={18} />
    Sign Out
  </button>
</BottomSheet>