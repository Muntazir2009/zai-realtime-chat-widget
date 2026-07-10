<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
  import ConnectionStatus from '$lib/components/indicators/ConnectionStatus.svelte';

  // Component references — dynamic imports for code splitting
  let AuthScreen: any = $state(null);
  let ChatList: any = $state(null);
  let Conversation: any = $state(null);
  let GlobalView: any = $state(null);
  let SettingsView: any = $state(null);
  let BottomNavBar: any = $state(null);
  let componentsReady = $state(false);

  let _prevView: string | null = null;
  let _prevTab: string | null = null;
  let viewKey = $state(0);

  onMount(async () => {
    if (!browser) return;

    const [
      authComp,
      chatListComp,
      convComp,
      globalComp,
      settingsComp,
      navComp,
    ] = await Promise.all([
      import('$lib/components/auth/AuthScreen.svelte'),
      import('$lib/components/chat/ChatList.svelte'),
      import('$lib/components/chat/Conversation.svelte'),
      import('$lib/components/chat/GlobalView.svelte'),
      import('$lib/components/chat/SettingsView.svelte'),
      import('$lib/components/ui/BottomNavBar.svelte'),
    ]);

    AuthScreen = authComp.default;
    ChatList = chatListComp.default;
    Conversation = convComp.default;
    GlobalView = globalComp.default;
    SettingsView = settingsComp.default;
    BottomNavBar = navComp.default;
    componentsReady = true;

    // If already authenticated, go to chat list
    if (authStore.isAuthenticated && uiStore.view === 'auth') {
      uiStore.setView('chatList');
    }
  });

  // Stores are direct imports (singletons) — their $state properties
  // are tracked natively by Svelte 5 without any wrapper.
  const view = $derived(
    !componentsReady ? 'loading' :
    !authStore.isAuthenticated ? 'auth' :
    (uiStore.view === 'auth' ? 'chatList' : uiStore.view ?? 'chatList')
  );

  const activeTab = $derived(uiStore.tab ?? 'dms');
  const showNav = $derived(view !== 'loading' && view !== 'auth');
  const tabKey = $derived(activeTab);

  // Watch for view changes to trigger side effects (load inbox, go online)
  $effect(() => {
    const v = view;
    if (v === 'loading') return;
    if (v === _prevView) return;
    _prevView = v;

    if (v === 'chatList' && authStore.user) {
      chatStore.loadInbox(authStore.user.id);
      presenceManager.goOnline();
    }
    if (v === 'auth') {
      chatStore.detachAllListeners();
      presenceManager.disconnect();
    }
  });

  // Watch for tab changes to bump the key for animation
  $effect(() => {
    const t = activeTab;
    if (t !== _prevTab) {
      _prevTab = t;
      viewKey++;
    }
  });
</script>

{#if view === 'loading'}
  <div class="h-full flex items-center justify-center" style="background-color: var(--bg-page);">
    <div class="animate-scale-in text-center">
      <div class="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style="background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, #000));">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </div>
      <p class="text-sm" style="color: var(--text-tertiary);">Loading...</p>
    </div>
  </div>
{:else if view === 'auth' && AuthScreen}
  <div class="animate-view-enter">
    <AuthScreen />
  </div>
{:else}
  <!-- Authenticated shell: content + bottom nav -->
  <div class="h-full flex flex-col" style="background-color: var(--bg-page);">
    <div class="flex-1 min-h-0 has-nav" class:has-nav={showNav}>
      {#if view === 'conversation' && Conversation}
        <div class="animate-view-enter h-full">
          <Conversation />
        </div>
      {:else}
        {#key tabKey}
          <div class="animate-tab-enter h-full">
            {#if activeTab === 'dms' && ChatList}
              <ChatList />
            {:else if activeTab === 'global' && GlobalView}
              <GlobalView />
            {:else if activeTab === 'settings' && SettingsView}
              <SettingsView />
            {/if}
          </div>
        {/key}
      {/if}
    </div>

    {#if showNav && BottomNavBar}
      <BottomNavBar />
    {/if}
  </div>
{/if}

<ConnectionStatus />
<ToastContainer />