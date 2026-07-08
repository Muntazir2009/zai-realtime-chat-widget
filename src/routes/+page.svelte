<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  // Dynamic imports resolved after mount
  let mounted = $state(false);
  let authStore: any = $state(null);
  let chatStore: any = $state(null);
  let uiStore: any = $state(null);
  let presenceManager: any = $state(null);
  let AuthScreen: any = $state(null);
  let ChatList: any = $state(null);
  let Conversation: any = $state(null);

  onMount(async () => {
    if (!browser) return;

    const [
      authMod,
      chatMod,
      uiMod,
      presenceMod,
      authComp,
      chatListComp,
      convComp,
    ] = await Promise.all([
      import('$lib/stores/auth.svelte'),
      import('$lib/stores/chat.svelte'),
      import('$lib/stores/ui.svelte'),
      import('$lib/managers/PresenceManager.svelte'),
      import('$lib/components/auth/AuthScreen.svelte'),
      import('$lib/components/chat/ChatList.svelte'),
      import('$lib/components/chat/Conversation.svelte'),
    ]);

    authStore = authMod.authStore;
    chatStore = chatMod.chatStore;
    uiStore = uiMod.uiStore;
    presenceManager = presenceMod.presenceManager;

    AuthScreen = authComp.default;
    ChatList = chatListComp.default;
    Conversation = convComp.default;

    mounted = true;
  });

  $effect(() => {
    if (!mounted || !authStore || !uiStore) return;

    if (authStore.isAuthenticated && uiStore.view === 'auth') {
      uiStore.setView('chatList');
    }

    if (uiStore.view === 'chatList' && authStore.user) {
      chatStore.loadInbox(authStore.user.id);
      presenceManager.goOnline();
    }

    if (!authStore.isAuthenticated) {
      chatStore.detachAllListeners();
    }
  });

  const view = $derived(
    !mounted ? 'loading' :
    !authStore?.isAuthenticated ? 'auth' :
    uiStore?.view ?? 'auth'
  );
</script>

{#if view === 'loading'}
  <div class="h-full flex items-center justify-center" style="background-color: var(--bg-page);">
    <div class="animate-scale-in text-center">
      <div class="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style="background: linear-gradient(135deg, #059669, #10b981);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </div>
      <p class="text-sm" style="color: var(--text-tertiary);">Loading...</p>
    </div>
  </div>
{:else if view === 'auth' && AuthScreen}
  {@const Auth = AuthScreen}
  <Auth />
{:else if view === 'chatList' && ChatList}
  {@const List = ChatList}
  <List />
{:else if view === 'conversation' && Conversation}
  {@const Conv = Conversation}
  <Conv />
{/if}