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
  let exitBackPressTime = $state(0);  // Timestamp of first back press
  let showExitToast = $state(false);
  let exitBackTimer: ReturnType<typeof setTimeout> | null = null;
  let LockScreenComp: any = $state(null);

  function handleBack() {
    const now = Date.now();
    if (view === 'conversation') {
      // In conversation: go back to chat list
      chatStore.closeChat();
      uiStore.setView('chatList');
      return;
    }
    // In main tabs: press-back-to-exit
    if (now - exitBackPressTime < 2000) {
      // Second press within 2s — exit
      showExitToast = false;
      if (exitBackTimer) { clearTimeout(exitBackTimer); exitBackTimer = null; }
      // Try to close the window/tab
      window.close();
      // If window.close() doesn't work (most browsers), navigate away
      setTimeout(() => {
        if (!window.closed) {
          window.location.href = 'about:blank';
        }
      }, 100);
    } else {
      // First press — show toast
      exitBackPressTime = now;
      showExitToast = true;
      if (exitBackTimer) clearTimeout(exitBackTimer);
      exitBackTimer = setTimeout(() => {
        showExitToast = false;
        exitBackPressTime = 0;
      }, 2000);
    }
  }

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

  // Viewport-level wallpaper for true edge-to-edge (extends behind nav & header)
  let chatWallpaper = $derived.by(() => {
    if (view !== 'conversation' || !chatStore.activeChatId) return null as string | null;
    const meta = chatStore.chats.get(chatStore.activeChatId);
    return meta?.wallpaper ?? null;
  });

  let wallpaperStyle = $derived.by(() => {
    const wp = chatWallpaper;
    if (!wp) return '';
    if (wp.startsWith('http')) return `background-image: url('${wp}'); background-size: cover; background-position: center;`;
    return `background: ${wp};`;
  });

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
  <div class="h-full flex items-center justify-center">
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
  <!-- When wallpaper is active, body background is cleared via svelte:body -->
  <div class="h-full flex flex-col" class:has-wallpaper={!!chatWallpaper}>
    <div class="flex-1 min-h-0 has-nav" class:has-nav={showNav}>
      {#if view === 'conversation' && Conversation}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="{skipConvEnterAnim ? '' : 'animate-conv-enter'} h-full"
          use:clearAnimAfterPlay
          use:backGesture={{
            onBack: handleBack,
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
      style="background: transparent; animation: fadeIn 200ms ease forwards;"
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

  <!-- Press back again to exit toast -->
  {#if showExitToast}
    <div class="exit-back-toast" style="animation: fadeSlideIn 200ms ease forwards;">
      <span style="display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Press back again to exit
      </span>
    </div>
  {/if}
{/if}

<!-- When wallpaper is active, strip body background so wallpaper shows edge-to-edge -->
<svelte:body class:wallpaper-active={!!chatWallpaper} />

<ConnectionStatus />

<!-- App Lock overlay: renders above everything when locked -->
{#if authStore.isAuthenticated && appLockStore.isLocked && LockScreenComp}
  <LockScreenComp />
{/if}

<style>
  /* ============================================================
     EDGE-TO-EDGE TRANSPARENCY
     When wallpaper is active, body/html backgrounds are stripped
     (via wallpaper-active class) and the conversation renders
     its wallpaper as position:fixed so it extends behind the nav.
     The nav's backdrop-filter samples the wallpaper directly.
     ============================================================ */

  /* When wallpaper is present, make the shell completely transparent */
  .has-wallpaper {
    background: transparent !important;
  }

  .exit-back-toast {
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
    padding: 10px 20px;
    border-radius: 100px;
    border: 1px solid var(--border-subtle);
    box-shadow: var(--glass-shadow);
    z-index: 9998;
    pointer-events: none;
    white-space: nowrap;
  }
</style>