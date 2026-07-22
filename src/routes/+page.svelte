<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { backGesture } from '$lib/actions/back-gesture';
  import { exitGesture } from '$lib/actions/exit-gesture';
  import { appLockStore } from '$lib/stores/app-lock.svelte';
  import ConnectionStatus from '$lib/components/indicators/ConnectionStatus.svelte';
  import LockScreen from '$lib/components/lock/LockScreen.svelte';

  // Svelte action: after a CSS animation finishes, clear the applied
  // transform/opacity so the element stops creating a new containing
  // block for position:fixed descendants.  animation-fill-mode: both/forwards
  // leaves transform:translateX(0) on the element even after it finishes,
  // which breaks all fixed-positioned popups inside it.
  function clearAnimAfterPlay(node: HTMLElement) {
    function onEnd(e: AnimationEvent) {
      if (e.target === node) {
        node.style.transform = '';
        node.style.opacity = '';
        node.style.animation = 'none';
      }
    }
    node.addEventListener('animationend', onEnd);
    return {
      destroy() { node.removeEventListener('animationend', onEnd); }
    };
  }

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
  let skipConvEnterAnim = $state(false);
  let showExitOverlay = $state(false);
  let LockScreenComp: any = $state(null);

  onMount(async () => {
    if (!browser) return;

    const [
      authComp,
      chatListComp,
      convComp,
      globalComp,
      settingsComp,
      navComp,
      lockComp,
    ] = await Promise.all([
      import('$lib/components/auth/AuthScreen.svelte'),
      import('$lib/components/chat/ChatList.svelte'),
      import('$lib/components/chat/Conversation.svelte'),
      import('$lib/components/chat/GlobalView.svelte'),
      import('$lib/components/chat/SettingsView.svelte'),
      import('$lib/components/ui/BottomNavBar.svelte'),
      import('$lib/components/lock/LockScreen.svelte'),
    ]);

    AuthScreen = authComp.default;
    ChatList = chatListComp.default;
    Conversation = convComp.default;
    GlobalView = globalComp.default;
    SettingsView = settingsComp.default;
    BottomNavBar = navComp.default;
    LockScreenComp = lockComp.default;
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
      appLockStore.onLogout();
    }
    // Initialize app lock on first authenticated view
    if (v === 'chatList' && authStore.user && !appLockStore.isInitialized) {
      appLockStore.onLogin();
    }
    // Push a history entry when entering a conversation so browser back works
    if (v === 'conversation' && browser) {
      history.pushState({ view: 'conversation' }, '');
      // Reset skip flag after a tick so the enter animation can play normally
      skipConvEnterAnim = false;
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
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="{skipConvEnterAnim ? '' : 'animate-conv-enter'} h-full"
          use:clearAnimAfterPlay
          use:backGesture={{
            onBack: () => {
              // Skip the enter animation on next conversation open
              // since we're animating the exit manually
              chatStore.closeChat();
              uiStore.setView('chatList');
            },
            edgeZone: 25,
          }}
          data-in-conversation=""
        >
          <Conversation />
        </div>
      {:else}
        {#key tabKey}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="animate-tab-enter-smooth h-full"
            use:exitGesture={{
              onExit: () => { showExitOverlay = true; },
              edgeZone: 25,
            }}
          >
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

  <!-- Exit overlay: shown after swipe-from-right-edge exit gesture -->
  {#if showExitOverlay}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center"
      style="background: var(--bg-page); animation: fadeIn 200ms ease forwards;"
      onpointerdown={() => { showExitOverlay = false; }}
    >
      <div class="text-center" style="animation: scaleIn 200ms cubic-bezier(0.22, 1, 0.36, 1) forwards;">
        <div class="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center" style="background: var(--glass-bg); border: 1px solid var(--border-subtle); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <p style="color: var(--text-secondary); font-size: 15px; font-weight: 500;">You're all caught up</p>
        <p style="color: var(--text-tertiary); font-size: 13px; margin-top: 4px;">Tap anywhere to go back</p>
      </div>
    </div>
  {/if}
{/if}

<ConnectionStatus />

<!-- App Lock overlay: renders above everything when locked -->
{#if authStore.isAuthenticated && appLockStore.isLocked && LockScreenComp}
  <LockScreenComp />
{/if}