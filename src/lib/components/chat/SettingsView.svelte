<script lang="ts">
  import {
    LogOut, Check, Moon, Sun, Smartphone, Shield, Palette, Info, Settings,
    Flame, Eye, ALargeSmall, MessageSquare, Minus, Circle, Square,
    Wifi, WifiOff, Activity, Clock, Trash2
  } from 'lucide-svelte';
  import { themeManager } from '$lib/managers/ThemeManager.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { networkManager } from '$lib/managers/NetworkManager.svelte';
  import { prefsStore, type FontSize, type BubbleStyle } from '$lib/stores/prefs.svelte';
  import type { ThemeMode } from '$lib/types/index';

  // ── Theme options ──
  const themes: { mode: ThemeMode; label: string; desc: string; icon: typeof Sun; gradient: string }[] = [
    { mode: 'light', label: 'Light', desc: 'Clean & bright', icon: Sun, gradient: 'linear-gradient(135deg, #f0fdf4, #d1fae5)' },
    { mode: 'dark', label: 'Dark', desc: 'Easy on the eyes', icon: Moon, gradient: 'linear-gradient(135deg, #0a0a0a, #1c1c1e)' },
    { mode: 'amoled', label: 'AMOLED', desc: 'True black', icon: Smartphone, gradient: 'linear-gradient(135deg, #000, #0a0a0a)' },
    { mode: 'crimson', label: 'Crimson', desc: 'Dark & bold', icon: Flame, gradient: 'linear-gradient(135deg, #0f0f13, #2a0a0a)' },
  ];

  // ── Font sizes ──
  const fontSizes: { size: FontSize; label: string; preview: string }[] = [
    { size: 'small', label: 'Small', preview: '13px' },
    { size: 'medium', label: 'Medium', preview: '15px' },
    { size: 'large', label: 'Large', preview: '17px' },
  ];

  // ── Bubble styles ──
  const bubbleStyles: { style: BubbleStyle; label: string; icon: typeof Circle }[] = [
    { style: 'round', label: 'Round', icon: Circle },
    { style: 'squircle', label: 'Squircle', icon: Square },
    { style: 'minimal', label: 'Minimal', icon: Minus },
  ];

  // ── Connection ──
  let connState = $derived(networkManager.connectionState);
  let lastSync = $derived(networkManager.lastSyncTimestamp);
  let connLabel = $derived(
    connState === 'active' ? 'Connected' :
    connState === 'dormant' ? 'Dormant' : 'Disconnected'
  );
  let connColor = $derived(
    connState === 'active' ? 'var(--color-primary)' :
    connState === 'dormant' ? 'var(--color-warning)' : 'var(--color-danger)'
  );

  // ── Stats ──
  let totalChats = $derived(chatStore.userChats.size);
  let cachedMessages = $derived(() => {
    let count = 0;
    for (const [, msgs] of chatStore.messages) count += msgs.length;
    return count;
  });

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  function handleLogout() {
    chatStore.detachAllListeners();
    presenceManager?.disconnect();
    authStore.logout();
    uiStore.setView('auth');
  }

  function clearCache() {
    localStorage.removeItem('chat-prefs');
    localStorage.removeItem('chat-theme');
    window.location.reload();
  }
</script>

<div class="flex flex-col h-full" style="background-color: var(--bg-page);">
  <!-- Header -->
  <header class="glass-header safe-top flex items-center justify-between px-4" style="height: 60px; min-height: 60px; z-index: 50;">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, var(--color-primary), var(--color-accent));">
        <Settings size={16} color="white" />
      </div>
      <div>
        <h1 class="text-lg font-bold leading-tight" style="color: var(--text-primary);">Settings</h1>
        <p class="text-[11px] leading-tight" style="color: var(--text-tertiary);">Preferences & account</p>
      </div>
    </div>
  </header>

  <!-- Settings Content -->
  <div class="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 pb-24 space-y-5">

    <!-- Profile Card -->
    <section class="glass rounded-[var(--radius-lg)] p-4 animate-fade-in">
      <div class="flex items-center gap-3">
        <div
          class="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white text-xl flex-shrink-0 shadow-md"
          style="background: linear-gradient(135deg, var(--color-primary), var(--color-accent));"
        >
          {authStore.user?.displayName?.charAt(0).toUpperCase() || '?'}
        </div>
        <div class="min-w-0 flex-1">
          <p class="font-bold text-base truncate" style="color: var(--text-primary);">
            {authStore.user?.displayName || 'Unknown'}
          </p>
          <p class="text-sm" style="color: var(--text-tertiary);">
            @{authStore.user?.username || 'unknown'}
          </p>
        </div>
        <div class="flex flex-col items-end gap-1">
          <span class="text-[10px] font-medium px-2 py-0.5 rounded-full" style="background: color-mix(in srgb, var(--color-primary) 12%, transparent); color: var(--color-primary);">
            Online
          </span>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════
         APPEARANCE
         ════════════════════════════════════════════ -->
    <section class="animate-fade-in" style="animation-delay: 30ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Palette size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Appearance</p>
      </div>
      <div class="grid grid-cols-4 gap-2">
        {#each themes as theme (theme.mode)}
          {@const isActive = themeManager.currentTheme === theme.mode}
          <button
            class="flex flex-col items-center gap-1.5 p-2.5 rounded-[var(--radius-md)] transition-all duration-200 active:scale-95 border"
            style={isActive
              ? 'background: var(--color-primary); color: var(--color-primary-foreground); border-color: var(--color-primary); box-shadow: 0 2px 12px color-mix(in srgb, var(--color-primary) 30%, transparent);'
              : 'background: var(--bg-surface); border-color: var(--border-subtle); color: var(--text-primary);'}
            onclick={() => themeManager.setTheme(theme.mode)}
          >
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: {isActive ? 'rgba(255,255,255,0.2)' : theme.gradient};">
              <theme.icon size={16} />
            </div>
            <span class="text-[11px] font-bold leading-tight">{theme.label}</span>
            {#if isActive}
              <div class="w-4 h-4 rounded-full flex items-center justify-center" style="background: var(--color-primary-foreground);">
                <Check size={9} style="color: var(--color-primary);" />
              </div>
            {:else}
              <div class="w-4 h-4"></div>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Font Size -->
      <div class="mt-3">
        <p class="text-[11px] font-medium mb-2 px-1" style="color: var(--text-tertiary);">Message Size</p>
        <div class="flex gap-2">
          {#each fontSizes as f (f.size)}
            {@const isActive = prefsStore.fontSize === f.size}
            <button
              class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold transition-all duration-200 active:scale-95 border"
              style={isActive
                ? 'background: var(--color-primary); color: var(--color-primary-foreground); border-color: var(--color-primary);'
                : 'background: var(--bg-surface); border-color: var(--border-subtle); color: var(--text-primary);'}
              onclick={() => prefsStore.setFontSize(f.size)}
            >
              <ALargeSmall size={f.size === 'small' ? 12 : f.size === 'large' ? 18 : 15} />
              {f.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Bubble Style -->
      <div class="mt-3">
        <p class="text-[11px] font-medium mb-2 px-1" style="color: var(--text-tertiary);">Bubble Style</p>
        <div class="flex gap-2">
          {#each bubbleStyles as b (b.style)}
            {@const isActive = prefsStore.bubbleStyle === b.style}
            <button
              class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold transition-all duration-200 active:scale-95 border"
              style={isActive
                ? 'background: var(--color-primary); color: var(--color-primary-foreground); border-color: var(--color-primary);'
                : 'background: var(--bg-surface); border-color: var(--border-subtle); color: var(--text-primary);'}
              onclick={() => prefsStore.setBubbleStyle(b.style)}
            >
              <b.icon size={14} />
              {b.label}
            </button>
          {/each}
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════
         PRIVACY & REALTIME
         ════════════════════════════════════════════ -->
    <section class="animate-fade-in" style="animation-delay: 80ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Shield size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Privacy & Realtime</p>
      </div>
      <div class="glass rounded-[var(--radius-lg)] overflow-hidden" style="border-color: var(--border-subtle);">
        <!-- Online Status -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-primary) 12%, transparent);">
              <Wifi size={16} style="color: var(--color-primary);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Show Online</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Let others see when you're active</p>
            </div>
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <button
            class="toggle-track"
            class:toggle-on={prefsStore.showOnline}
            onclick={() => {
              prefsStore.setShowOnline(!prefsStore.showOnline);
              if (!prefsStore.showOnline) presenceManager?.goOffline();
              else if (authStore.user) presenceManager?.goOnline();
            }}
            role="switch"
            aria-checked={prefsStore.showOnline}
            aria-label="Toggle online status"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <!-- Read Receipts -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-accent) 12%, transparent);">
              <Eye size={16} style="color: var(--color-accent);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Read Receipts</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Show when you've read messages</p>
            </div>
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <button
            class="toggle-track"
            class:toggle-on={prefsStore.sendReadReceipts}
            onclick={() => prefsStore.setSendReadReceipts(!prefsStore.sendReadReceipts)}
            role="switch"
            aria-checked={prefsStore.sendReadReceipts}
            aria-label="Toggle read receipts"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <!-- Typing Indicators -->
        <div class="flex items-center justify-between p-3.5">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-warning) 12%, transparent);">
              <MessageSquare size={16} style="color: var(--color-warning);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Typing Indicators</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Show when you're typing a message</p>
            </div>
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <button
            class="toggle-track"
            class:toggle-on={prefsStore.sendTypingIndicators}
            onclick={() => prefsStore.setSendTypingIndicators(!prefsStore.sendTypingIndicators)}
            role="switch"
            aria-checked={prefsStore.sendTypingIndicators}
            aria-label="Toggle typing indicators"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════
         REALTIME STATUS
         ════════════════════════════════════════════ -->
    <section class="animate-fade-in" style="animation-delay: 120ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Activity size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Realtime Status</p>
      </div>
      <div class="glass rounded-[var(--radius-lg)] overflow-hidden" style="border-color: var(--border-subtle);">
        <!-- Connection State -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, {connColor} 12%, transparent);">
              {#if connState === 'active'}
                <Wifi size={16} style="color: {connColor};" />
              {:else}
                <WifiOff size={16} style="color: {connColor};" />
              {/if}
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Connection</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Firebase RTDB</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full" style="background: {connColor}; box-shadow: 0 0 6px {connColor};"></div>
            <span class="text-xs font-semibold" style="color: {connColor};">{connLabel}</span>
          </div>
        </div>

        <!-- Last Sync -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--input-bg);">
              <Clock size={16} style="color: var(--text-secondary);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Last Synced</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Last data refresh</p>
            </div>
          </div>
          <span class="text-xs font-medium" style="color: var(--text-secondary);">{formatTime(lastSync)}</span>
        </div>

        <!-- Open Chats -->
        <div class="flex items-center justify-between p-3.5">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--input-bg);">
              <MessageSquare size={16} style="color: var(--text-secondary);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Cached Data</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">{totalChats} chats, {cachedMessages()} messages</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════
         DATA MANAGEMENT
         ════════════════════════════════════════════ -->
    <section class="animate-fade-in" style="animation-delay: 160ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Info size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Data</p>
      </div>
      <div class="glass rounded-[var(--radius-lg)] overflow-hidden" style="border-color: var(--border-subtle);">
        <!-- Version -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--input-bg);">
              <Info size={16} style="color: var(--text-secondary);" />
            </div>
            <span class="text-sm font-medium" style="color: var(--text-primary);">Version</span>
          </div>
          <span class="text-xs font-mono" style="color: var(--text-tertiary);">v1.0-stable</span>
        </div>

        <!-- Clear Cache -->
        <button
          class="w-full flex items-center justify-between p-3.5 transition-colors duration-150 active:bg-[var(--input-bg)]"
          onclick={clearCache}
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-warning) 12%, transparent);">
              <Trash2 size={16} style="color: var(--color-warning);" />
            </div>
            <span class="text-sm font-medium" style="color: var(--text-primary);">Reset Preferences</span>
          </div>
          <span class="text-xs" style="color: var(--text-tertiary);">Restores defaults</span>
        </button>
      </div>
    </section>

    <!-- Logout -->
    <section class="animate-fade-in" style="animation-delay: 200ms;">
      <button
        class="w-full glass flex items-center justify-center gap-2.5 min-h-[48px] rounded-[var(--radius-lg)] font-semibold text-sm transition-all duration-200 active:scale-[0.97]"
        style="background: color-mix(in srgb, var(--color-danger) 8%, transparent); color: var(--color-danger); border-color: color-mix(in srgb, var(--color-danger) 12%, transparent);"
        onclick={handleLogout}
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </section>

  </div>
</div>

<style>
  /* Toggle switch */
  .toggle-track {
    position: relative;
    width: 44px;
    height: 26px;
    min-width: 44px;
    border-radius: 13px;
    background: var(--input-bg);
    border: 1.5px solid var(--border-subtle);
    cursor: pointer;
    transition: background 250ms ease, border-color 250ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .toggle-track:active {
    transform: scale(0.94);
  }

  .toggle-on {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .toggle-on .toggle-thumb {
    transform: translateX(18px);
  }
</style>