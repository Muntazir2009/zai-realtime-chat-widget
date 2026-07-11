<script lang="ts">
  import {
    LogOut, Check, Moon, Sun, Smartphone, Shield, Palette, Info, Settings,
    Flame, Eye, ALargeSmall, MessageSquare, Minus, Circle, Square,
    Wifi, WifiOff, Activity, Clock, Trash2, Bell, BellOff,
    Volume2, VolumeX, Vibrate, Lock, ChevronRight,
    Sparkles, LayoutGrid, Type, Monitor,
    Camera, Pencil, X, Smile
  } from 'lucide-svelte';
  import { themeManager } from '$lib/managers/ThemeManager.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { uploadFile } from '$lib/firebase/storage';
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

  // ── Profile Editing ──
  let isEditingName = $state(false);
  let editNameValue = $state('');
  let editBioValue = $state('');
  let isUploadingAvatar = $state(false);
  let isSavingProfile = $state(false);

  // Accent color presets
  const accentColors = [
    { label: 'Default', value: null },
    { label: 'Rose', value: '#f43f5e' },
    { label: 'Orange', value: '#f97316' },
    { label: 'Amber', value: '#f59e0b' },
    { label: 'Emerald', value: '#10b981' },
    { label: 'Teal', value: '#14b8a6' },
    { label: 'Cyan', value: '#06b6d4' },
    { label: 'Indigo', value: '#6366f1' },
    { label: 'Purple', value: '#a855f7' },
    { label: 'Pink', value: '#ec4899' },
  ];

  // Emoji status presets
  const emojiStatuses = [
    { emoji: null, label: 'None' },
    { emoji: '😊', label: 'Happy' },
    { emoji: '🔥', label: 'On Fire' },
    { emoji: '💡', label: 'Idea' },
    { emoji: '🎮', label: 'Gaming' },
    { emoji: '🎵', label: 'Music' },
    { emoji: '📚', label: 'Reading' },
    { emoji: '💪', label: 'Working Out' },
    { emoji: '☕', label: 'Coffee' },
    { emoji: '🌙', label: 'Night Owl' },
    { emoji: '✈️', label: 'Traveling' },
    { emoji: '🎉', label: 'Celebrating' },
    { emoji: '💻', label: 'Coding' },
    { emoji: '🎨', label: 'Creative' },
  ];

  // Get current user profile from userDict (real-time synced)
  let userProfile = $derived.by(() => {
    if (!authStore.user) return null;
    return chatStore.userDict.get(authStore.user.id) ?? authStore.user;
  });

  // Derived values
  let currentBio = $derived(userProfile?.bio || '');
  let currentAccentColor = $derived(userProfile?.accentColor || null);
  let currentEmojiStatus = $derived(userProfile?.emojiStatus || null);
  let currentAvatarUrl = $derived(userProfile?.avatarUrl || null);

  // Profile update helper
  async function updateProfile(fields: Record<string, unknown>) {
    if (!authStore.user?.username) return;
    isSavingProfile = true;
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authStore.user.username, ...fields }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Update failed');
      }
      // Also update local authStore.user
      if (fields.displayName && authStore.user) {
        authStore.user = { ...authStore.user, displayName: fields.displayName as string };
      }
      toastStore.show('Profile updated', 'success');
    } catch (err) {
      toastStore.show(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      isSavingProfile = false;
    }
  }

  // Avatar upload handler
  async function handleAvatarUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      isUploadingAvatar = true;
      try {
        const result = await uploadFile(file, 'avatars', `avatar-${Date.now()}.webp`);
        await updateProfile({ avatarUrl: result.publicUrl });
      } catch (err) {
        toastStore.show('Failed to upload avatar', 'error');
      } finally {
        isUploadingAvatar = false;
      }
    };
    input.click();
  }

  // Name editing handlers
  function startEditName() {
    editNameValue = authStore.user?.displayName || '';
    isEditingName = true;
  }

  function cancelEditName() {
    isEditingName = false;
  }

  async function saveName() {
    if (!editNameValue.trim()) return;
    await updateProfile({ displayName: editNameValue.trim() });
    isEditingName = false;
  }

  // Bio auto-save with debounce
  let bioTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleBioBlur() {
    if (bioTimer) clearTimeout(bioTimer);
    const newBio = editBioValue.trim().slice(0, 120);
    if (newBio !== currentBio) {
      await updateProfile({ bio: newBio });
    }
  }

  function handleBioInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    editBioValue = target.value;
    // Auto-resize textarea
    target.style.height = 'auto';
    target.style.height = target.scrollHeight + 'px';
    // Debounced save
    if (bioTimer) clearTimeout(bioTimer);
    bioTimer = setTimeout(async () => {
      const newBio = editBioValue.trim().slice(0, 120);
      if (newBio !== currentBio) {
        await updateProfile({ bio: newBio });
      }
    }, 800);
  }

  // Sync editBioValue when currentBio changes externally
  $effect(() => {
    if (!document.activeElement?.classList.contains('bio-textarea')) {
      editBioValue = currentBio;
    }
  });
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

    <!-- Profile Editor -->
    <section class="glass rounded-[var(--radius-lg)] p-4 settings-section-enter">
      <!-- Avatar Row -->
      <div class="flex items-start gap-4">
        <!-- Tappable Avatar -->
        <button
          class="profile-avatar-wrap"
          onclick={handleAvatarUpload}
          disabled={isUploadingAvatar}
          aria-label="Upload avatar"
        >
          {#if currentAvatarUrl}
            <img
              src={currentAvatarUrl}
              alt="Avatar"
              class="profile-avatar-img"
            />
          {:else}
            <div
              class="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-white text-2xl flex-shrink-0 shadow-md"
              style="background: linear-gradient(135deg, var(--color-primary), var(--color-accent));"
            >
              {authStore.user?.displayName?.charAt(0).toUpperCase() || '?'}
            </div>
          {/if}
          {#if isUploadingAvatar}
            <div class="profile-avatar-overlay">
              <div class="profile-spinner"></div>
            </div>
          {:else}
            <div class="profile-avatar-overlay profile-avatar-overlay-hover">
              <Camera size={18} color="white" />
            </div>
          {/if}
        </button>

        <!-- Name + Username -->
        <div class="min-w-0 flex-1 pt-0.5">
          {#if isEditingName}
            <div class="flex items-center gap-1.5 mb-0.5">
              <input
                type="text"
                class="profile-name-input"
                value={editNameValue}
                maxlength={30}
                oninput={(e) => editNameValue = (e.target as HTMLInputElement).value}
                onkeydown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') cancelEditName();
                }}
                autofocus
              />
              <button class="profile-icon-btn" style="color: var(--color-primary);" onclick={saveName} aria-label="Save name">
                <Check size={16} />
              </button>
              <button class="profile-icon-btn" style="color: var(--text-tertiary);" onclick={cancelEditName} aria-label="Cancel">
                <X size={16} />
              </button>
            </div>
          {:else}
            <div class="flex items-center gap-1.5 mb-0.5">
              <p class="font-bold text-base truncate" style="color: var(--text-primary);">
                {authStore.user?.displayName || 'Unknown'}
              </p>
              <button class="profile-icon-btn" style="color: var(--text-tertiary);" onclick={startEditName} aria-label="Edit name">
                <Pencil size={13} />
              </button>
            </div>
          {/if}
          <p class="text-sm" style="color: var(--text-tertiary);">
            @{authStore.user?.username || 'unknown'}
          </p>
          {#if currentEmojiStatus}
            <span class="inline-block mt-1 text-sm">{currentEmojiStatus}</span>
          {/if}
        </div>
      </div>

      <!-- Bio -->
      <div class="mt-3">
        <textarea
          class="bio-textarea"
          placeholder="Write a short bio..."
          maxlength={120}
          value={editBioValue}
          oninput={handleBioInput}
          onblur={handleBioBlur}
          rows={1}
        ></textarea>
        <p class="text-right text-[10px] mt-0.5" style="color: var(--text-tertiary);">
          {editBioValue.length}/120
        </p>
      </div>
    </section>

    <!-- ════════════════════════════════════════════
         EMOJI STATUS
         ════════════════════════════════════════════ -->
    <section class="settings-section-enter" style="animation-delay: 15ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Smile size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Emoji Status</p>
      </div>
      <div class="glass rounded-[var(--radius-lg)] p-3">
        <div class="emoji-scroll">
          {#each emojiStatuses as item (item.emoji ?? '__none__')}
            {@const isActive = currentEmojiStatus === item.emoji}
            <button
              class="emoji-pill"
              class:emoji-pill-active={isActive}
              onclick={() => updateProfile({ emojiStatus: item.emoji })}
              title={item.label}
              aria-label={item.label}
              aria-pressed={isActive}
            >
              {#if item.emoji}
                <span class="text-base">{item.emoji}</span>
              {:else}
                <X size={12} style="color: var(--text-tertiary);" />
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════
         ACCENT COLOR
         ════════════════════════════════════════════ -->
    <section class="settings-section-enter" style="animation-delay: 22ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Palette size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Accent Color</p>
      </div>
      <div class="glass rounded-[var(--radius-lg)] p-3">
        <div class="color-scroll">
          {#each accentColors as c (c.label)}
            {@const isActive = currentAccentColor === c.value}
            <button
              class="color-circle-wrap"
              onclick={() => updateProfile({ accentColor: c.value })}
              title={c.label}
              aria-label={c.label}
              aria-pressed={isActive}
            >
              <div
                class="color-circle"
                class:color-circle-active={isActive}
                style={c.value
                  ? `background: ${c.value}; ${isActive ? `box-shadow: 0 0 0 2.5px var(--bg-surface), 0 0 0 4.5px ${c.value};` : ''}`
                  : `background: linear-gradient(135deg, var(--color-primary), var(--color-accent)); ${isActive ? 'box-shadow: 0 0 0 2.5px var(--bg-surface), 0 0 0 4.5px var(--color-primary);' : ''}`}
              >
                {#if isActive}
                  <Check size={16} color={c.value || 'white'} style="position: relative; z-index: 1;" />
                {/if}
              </div>
              <span class="color-label">{c.label}</span>
            </button>
          {/each}
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

  /* ════════════════════════════════════════════
     PROFILE EDITOR
     ════════════════════════════════════════════ */
  .profile-avatar-wrap {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 16px;
    overflow: hidden;
    flex-shrink: 0;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms ease;
  }

  .profile-avatar-wrap:active {
    transform: scale(0.97);
  }

  .profile-avatar-img {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    object-fit: cover;
    display: block;
  }

  .profile-avatar-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 16px;
    opacity: 0;
    transition: opacity 200ms ease;
    pointer-events: none;
  }

  .profile-avatar-overlay-hover:hover {
    opacity: 1;
  }

  /* Always show overlay during upload */
  .profile-avatar-wrap:disabled .profile-avatar-overlay {
    opacity: 1;
    pointer-events: none;
  }

  .profile-spinner {
    width: 22px;
    height: 22px;
    border: 2.5px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: avatarSpin 700ms linear infinite;
  }

  @keyframes avatarSpin {
    to { transform: rotate(360deg); }
  }

  .profile-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: none;
    background: var(--input-bg);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .profile-icon-btn:active {
    transform: scale(0.9);
  }

  .profile-name-input {
    flex: 1;
    min-width: 0;
    background: var(--input-bg);
    border: 1.5px solid var(--color-primary);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    outline: none;
    font-family: inherit;
  }

  .bio-textarea {
    width: 100%;
    min-height: 36px;
    background: var(--input-bg);
    border: 1.5px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 8px 10px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-primary);
    outline: none;
    resize: none;
    font-family: inherit;
    transition: border-color 200ms ease;
    box-sizing: border-box;
  }

  .bio-textarea:focus {
    border-color: var(--color-primary);
  }

  .bio-textarea::placeholder {
    color: var(--text-tertiary);
  }

  /* Emoji scroll row */
  .emoji-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .emoji-scroll::-webkit-scrollbar {
    display: none;
  }

  .emoji-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1.5px solid var(--border-subtle);
    background: var(--bg-surface);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .emoji-pill:active {
    transform: scale(0.9);
  }

  .emoji-pill-active {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    border-color: var(--color-primary);
  }

  /* Color scroll row */
  .color-scroll {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .color-scroll::-webkit-scrollbar {
    display: none;
  }

  .color-circle-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms ease;
  }

  .color-circle-wrap:active {
    transform: scale(0.9);
  }

  .color-circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 200ms ease;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  .color-label {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
</style>