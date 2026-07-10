<script lang="ts">
  import {
    LogOut, Check, Moon, Sun, Smartphone, Shield, Palette, Info, Settings,
    Flame, Eye, ALargeSmall, MessageSquare, Minus, Circle, Square,
    Wifi, WifiOff, Activity, Clock, Trash2, Bell, BellOff,
    Volume2, VolumeX, Vibrate, Lock, ChevronRight,
    Sparkles, LayoutGrid, Type, Monitor
  } from 'lucide-svelte';
  import { themeManager } from '$lib/managers/ThemeManager.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { networkManager } from '$lib/managers/NetworkManager.svelte';
  import { prefsStore, type FontSize, type BubbleStyle } from '$lib/stores/prefs.svelte';
  import type { ThemeMode } from '$lib/types/index';

  // ── Dialog state ──
  let showDialog = $state(false);
  let dialogTitle = $state('');
  let dialogMessage = $state('');
  let dialogConfirmText = $state('Confirm');
  let dialogDestructive = $state(false);
  let dialogCallback: (() => void) | null = $state(null);

  function openDialog(title: string, message: string, confirmText: string, destructive: boolean, cb: () => void) {
    dialogTitle = title;
    dialogMessage = message;
    dialogConfirmText = confirmText;
    dialogDestructive = destructive;
    dialogCallback = cb;
    showDialog = true;
  }

  function closeDialog() {
    showDialog = false;
    dialogCallback = null;
  }

  function confirmDialog() {
    if (dialogCallback) dialogCallback();
    closeDialog();
  }

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

  // ── Wallpaper options ──
  const wallpapers = [
    { id: 'default', label: 'Default', preview: 'var(--bg-page)' },
    { id: 'warm', label: 'Warm', preview: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
    { id: 'ocean', label: 'Ocean', preview: 'linear-gradient(135deg, #e0f2fe, #bae6fd)' },
    { id: 'forest', label: 'Forest', preview: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
    { id: 'lavender', label: 'Lavender', preview: 'linear-gradient(135deg, #ede9fe, #ddd6fe)' },
    { id: 'sunset', label: 'Sunset', preview: 'linear-gradient(135deg, #fecaca, #fda4af)' },
  ];

  let activeWallpaper = $state('default');

  function setWallpaper(id: string) {
    activeWallpaper = id;
    const wp = wallpapers.find(w => w.id === id);
    if (wp && id !== 'default') {
      document.documentElement.style.setProperty('--bg-page', '');
      // Apply gradient as background
    } else {
      document.documentElement.style.removeProperty('--chat-wallpaper');
    }
    localStorage.setItem('chat-wallpaper', id);
  }

  // Load saved wallpaper
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('chat-wallpaper');
    if (saved) activeWallpaper = saved;
  }

  // ── Notification preferences (client-only, stored in prefs) ──
  let notifSound = $state(true);
  let notifVibrate = $state(true);
  let notifPreview = $state(true);
  let enterSend = $state(true);

  function loadNotifPrefs() {
    try {
      const raw = localStorage.getItem('chat-notif-prefs');
      if (raw) {
        const p = JSON.parse(raw);
        notifSound = p.sound ?? true;
        notifVibrate = p.vibrate ?? true;
        notifPreview = p.preview ?? true;
        enterSend = p.enterSend ?? true;
      }
    } catch {}
  }

  function saveNotifPrefs() {
    localStorage.setItem('chat-notif-prefs', JSON.stringify({
      sound: notifSound, vibrate: notifVibrate, preview: notifPreview, enterSend,
    }));
  }

  $effect(() => {
    saveNotifPrefs();
  });

  loadNotifPrefs();

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
    openDialog(
      'Sign Out',
      'Are you sure you want to sign out? You will need to log in again.',
      'Sign Out',
      true,
      () => {
        chatStore.detachAllListeners();
        presenceManager?.disconnect();
        authStore.logout();
        uiStore.setView('auth');
      }
    );
  }

  function clearCache() {
    openDialog(
      'Reset All Preferences',
      'This will reset all your preferences to their defaults including theme, font size, bubble style, privacy settings, and notification preferences. This action cannot be undone.',
      'Reset Everything',
      true,
      () => {
        localStorage.removeItem('chat-prefs');
        localStorage.removeItem('chat-theme');
        localStorage.removeItem('chat-notif-prefs');
        localStorage.removeItem('chat-wallpaper');
        window.location.reload();
      }
    );
  }

  function clearChatCache() {
    openDialog(
      'Clear Chat Cache',
      'This will clear all cached messages and chat data. Your messages on the server are not affected.',
      'Clear Cache',
      true,
      () => {
        chatStore.detachAllListeners();
        chatStore.userChats.clear();
        chatStore.messages.clear();
        if (authStore.user) chatStore.loadInbox(authStore.user.id);
      }
    );
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
    <section class="glass rounded-[var(--radius-lg)] p-4 settings-section-enter">
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
    <section class="settings-section-enter" style="animation-delay: 30ms;">
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
        <div class="flex items-center gap-2 mb-2 px-1">
          <Type size={13} style="color: var(--text-tertiary);" />
          <p class="text-[11px] font-medium" style="color: var(--text-tertiary);">Message Size</p>
        </div>
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
        <div class="flex items-center gap-2 mb-2 px-1">
          <MessageSquare size={13} style="color: var(--text-tertiary);" />
          <p class="text-[11px] font-medium" style="color: var(--text-tertiary);">Bubble Style</p>
        </div>
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

      <!-- Compact Mode -->
      <div class="mt-3 glass rounded-[var(--radius-lg)] overflow-hidden" style="border-color: var(--border-subtle);">
        <div class="flex items-center justify-between p-3.5">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-accent) 12%, transparent);">
              <LayoutGrid size={16} style="color: var(--color-accent);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Compact Mode</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Smaller avatars & spacing</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={prefsStore.compactMode}
            onclick={() => prefsStore.setCompactMode(!prefsStore.compactMode)}
            role="switch"
            aria-checked={prefsStore.compactMode}
            aria-label="Toggle compact mode"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════
         NOTIFICATIONS & SOUNDS
         ════════════════════════════════════════════ -->
    <section class="settings-section-enter" style="animation-delay: 60ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Bell size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Notifications</p>
      </div>
      <div class="glass rounded-[var(--radius-lg)] overflow-hidden" style="border-color: var(--border-subtle);">
        <!-- Notification Sound -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-primary) 12%, transparent);">
              {#if notifSound}
                <Volume2 size={16} style="color: var(--color-primary);" />
              {:else}
                <VolumeX size={16} style="color: var(--text-tertiary);" />
              {/if}
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Sound</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Play sound for new messages</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={notifSound}
            onclick={() => notifSound = !notifSound}
            role="switch"
            aria-checked={notifSound}
            aria-label="Toggle notification sound"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <!-- Vibration -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-warning) 12%, transparent);">
              <Vibrate size={16} style="color: var(--color-warning);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Vibration</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Haptic feedback on receive</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={notifVibrate}
            onclick={() => notifVibrate = !notifVibrate}
            role="switch"
            aria-checked={notifVibrate}
            aria-label="Toggle vibration"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <!-- Message Preview -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-accent) 12%, transparent);">
              <Eye size={16} style="color: var(--color-accent);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Message Preview</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Show message content in notifications</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={notifPreview}
            onclick={() => notifPreview = !notifPreview}
            role="switch"
            aria-checked={notifPreview}
            aria-label="Toggle message preview"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <!-- Enter to Send -->
        <div class="flex items-center justify-between p-3.5">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--input-bg);">
              <Monitor size={16} style="color: var(--text-secondary);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Enter to Send</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Press Enter to send, Shift+Enter for newline</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={enterSend}
            onclick={() => enterSend = !enterSend}
            role="switch"
            aria-checked={enterSend}
            aria-label="Toggle enter to send"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════
         PRIVACY & REALTIME
         ════════════════════════════════════════════ -->
    <section class="settings-section-enter" style="animation-delay: 100ms;">
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
    <section class="settings-section-enter" style="animation-delay: 140ms;">
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
            <div class="conn-dot" style="background: {connColor}; box-shadow: 0 0 6px {connColor};"></div>
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
    <section class="settings-section-enter" style="animation-delay: 180ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Info size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Data</p>
      </div>
      <div class="glass rounded-[var(--radius-lg)] overflow-hidden" style="border-color: var(--border-subtle);">
        <!-- Version -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--input-bg);">
              <Sparkles size={16} style="color: var(--text-secondary);" />
            </div>
            <span class="text-sm font-medium" style="color: var(--text-primary);">Version</span>
          </div>
          <span class="text-xs font-mono px-2 py-0.5 rounded-md" style="color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 10%, transparent);">v1.1.0</span>
        </div>

        <!-- Storage Info -->
        <div class="flex items-center justify-between p-3.5" style="border-bottom: 1px solid var(--border-subtle);">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--input-bg);">
              <Lock size={16} style="color: var(--text-secondary);" />
            </div>
            <div>
              <p class="text-sm font-medium" style="color: var(--text-primary);">Storage</p>
              <p class="text-[11px]" style="color: var(--text-tertiary);">Data stored locally & encrypted in transit</p>
            </div>
          </div>
          <ChevronRight size={16} style="color: var(--text-tertiary);" />
        </div>

        <!-- Clear Chat Cache -->
        <button
          class="w-full flex items-center justify-between p-3.5 transition-colors duration-150 active:bg-[var(--input-bg)]"
          onclick={clearChatCache}
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-warning) 12%, transparent);">
              <Trash2 size={16} style="color: var(--color-warning);" />
            </div>
            <span class="text-sm font-medium" style="color: var(--text-primary);">Clear Chat Cache</span>
          </div>
          <span class="text-xs" style="color: var(--text-tertiary);">{cachedMessages()} messages</span>
        </button>

        <!-- Reset All Preferences -->
        <button
          class="w-full flex items-center justify-between p-3.5 transition-colors duration-150 active:bg-[var(--input-bg)]"
          onclick={clearCache}
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: color-mix(in srgb, var(--color-danger) 12%, transparent);">
              <Trash2 size={16} style="color: var(--color-danger);" />
            </div>
            <span class="text-sm font-medium" style="color: var(--text-primary);">Reset All Preferences</span>
          </div>
          <span class="text-xs" style="color: var(--text-tertiary);">Restores defaults</span>
        </button>
      </div>
    </section>

    <!-- Logout -->
    <section class="settings-section-enter" style="animation-delay: 260ms;">
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

<!-- ════════════════════════════════════════════
     CONFIRMATION DIALOG
     ════════════════════════════════════════════ -->
{#if showDialog}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-overlay"
    onclick={closeDialog}
    role="dialog"
    aria-modal="true"
    aria-label={dialogTitle}
  >
    <div class="dialog-card" onclick={(e) => e.stopPropagation()}>
      <div class="dialog-icon-wrap" class:dialog-icon-destructive={dialogDestructive}>
        {#if dialogDestructive}
          <Trash2 size={20} />
        {:else}
          <Shield size={20} />
        {/if}
      </div>
      <h3 class="dialog-title">{dialogTitle}</h3>
      <p class="dialog-message">{dialogMessage}</p>
      <div class="dialog-actions">
        <button class="dialog-cancel" onclick={closeDialog}>Cancel</button>
        <button
          class="dialog-confirm"
          class:dialog-confirm-destructive={dialogDestructive}
          onclick={confirmDialog}
        >
          {dialogConfirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

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

  /* Connection dot pulse */
  .conn-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    animation: connPulse 2s ease-in-out infinite;
  }

  @keyframes connPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.85); }
  }

  /* Section staggered entrance */
  .settings-section-enter {
    animation: sectionSlideIn 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes sectionSlideIn {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.99);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* ════════════════════════════════════════════
     DIALOG
     ════════════════════════════════════════════ */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: overlayIn 200ms ease both;
  }

  @keyframes overlayIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dialog-card {
    width: 100%;
    max-width: 320px;
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
    padding: 24px;
    text-align: center;
    animation: dialogSpring 350ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes dialogSpring {
    from {
      opacity: 0;
      transform: scale(0.88) translateY(16px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .dialog-icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    background: color-mix(in srgb, var(--color-warning) 12%, transparent);
    color: var(--color-warning);
    transition: all 200ms ease;
  }

  .dialog-icon-destructive {
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
    color: var(--color-danger);
  }

  .dialog-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .dialog-message {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-secondary);
    margin-bottom: 20px;
  }

  .dialog-actions {
    display: flex;
    gap: 10px;
  }

  .dialog-cancel,
  .dialog-confirm {
    flex: 1;
    min-height: 42px;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
  }

  .dialog-cancel {
    background: var(--input-bg);
    color: var(--text-primary);
  }

  .dialog-cancel:active { transform: scale(0.95); }

  .dialog-confirm {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  .dialog-confirm:active { transform: scale(0.95); }

  .dialog-confirm-destructive {
    background: var(--color-danger);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-danger) 30%, transparent);
  }
</style>