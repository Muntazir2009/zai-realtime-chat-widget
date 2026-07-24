<script lang="ts">
  import {
    LogOut, Check, Moon, Sun, Smartphone, Shield, Palette, Settings,
    Flame, Eye, ALargeSmall, MessageSquare, Minus, Circle, Square,
    Wifi, WifiOff, Activity, Clock, Trash2,
    Lock, ChevronRight, ChevronDown,
    Sparkles, LayoutGrid, Type,
    Camera, Pencil, X,
    // New icons for privacy & customisation
    EyeOff, Zap, Link2, Image, Play, PlayCircle, Users, ArrowUpDown, Sparkles as SparkleIcon, Ghost, Timer, Gauge, Layers, Volume2, Globe
  } from 'lucide-svelte';
  import { themeManager } from '$lib/managers/ThemeManager.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { uploadFile } from '$lib/firebase/storage';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { networkManager } from '$lib/managers/NetworkManager.svelte';
  import { prefsStore, type FontSize, type BubbleStyle, type TimestampFormat, type AnimationSpeed, type MediaQuality, type ChatSortOrder } from '$lib/stores/prefs.svelte';
  import { appLockStore, type LockType, type AutoLockDuration } from '$lib/stores/app-lock.svelte';
  import { isBiometricAvailable, registerBiometric, clearBiometric } from '$lib/utils/biometric';
  import type { ThemeMode } from '$lib/types/index';

  // ── App Lock state ──
  let showLockSetup = $state(false);
  let lockSetupMode: 'enable' | 'change' = $state('enable');
  let lockInputValue = $state('');
  let lockConfirmValue = $state('');
  let lockFieldInput = $state('');
  let lockOldFieldInput = $state('');
  // Steps: 'verify' (enter old secret) → 'input' (new secret) → 'confirm' (re-enter new secret)
  let lockSetupStep: 'verify' | 'input' | 'confirm' = $state('input');
  let lockSetupError = $state('');
  let lockSetupShaking = $state(false);
  let showLockSecurityPanel = $state(false);
  let bioAvail = $state(false);
  let bioBusy = $state(false);
  let bioError = $state();
  let showBioConfirm = $state(false);

  // Sync the single input field to the correct variable based on step
  $effect(() => {
    if (lockSetupStep === 'verify') lockFieldInput = lockOldFieldInput;
    else if (lockSetupStep === 'input') lockFieldInput = lockInputValue;
    else lockFieldInput = lockConfirmValue;
  });

  const lockTypes: { type: LockType; label: string; desc: string }[] = [
    { type: 'pin4', label: '4-Digit PIN', desc: 'Quick & simple' },
    { type: 'pin6', label: '6-Digit PIN', desc: 'More secure' },
    { type: 'password', label: 'Password', desc: 'Letters, numbers & symbols' },
  ];

  const autoLockOptions: { value: AutoLockDuration; label: string }[] = [
    { value: 'immediate', label: 'Immediately' },
    { value: '30s', label: '30 seconds' },
    { value: '1m', label: '1 minute' },
    { value: '5m', label: '5 minutes' },
    { value: '15m', label: '15 minutes' },
    { value: 'never', label: 'Never' },
  ];

  const lockTypeLabel = $derived(
    appLockStore.settings.lockType === 'password' ? 'password' :
    appLockStore.settings.lockType === 'pin6' ? '6-digit PIN' : '4-digit PIN'
  );

  const lockTypeMaxLength = $derived(
    appLockStore.settings.lockType === 'pin4' ? 4 :
    appLockStore.settings.lockType === 'pin6' ? 6 : 32
  );

  function openLockSetup(mode: 'enable' | 'change') {
    lockSetupMode = mode;
    lockInputValue = '';
    lockConfirmValue = '';
    lockOldFieldInput = '';
    lockFieldInput = '';
    lockSetupError = '';
    // If changing, require old secret verification first
    lockSetupStep = mode === 'change' ? 'verify' : 'input';
    showLockSetup = true;
  }

  function closeLockSetup() {
    showLockSetup = false;
    lockInputValue = '';
    lockConfirmValue = '';
    lockOldFieldInput = '';
    lockFieldInput = '';
    lockSetupError = '';
  }

  function triggerLockShake() {
    lockSetupShaking = true;
    setTimeout(() => { lockSetupShaking = false; }, 400);
  }

  async function lockSetupVerifyOld() {
    lockOldFieldInput = lockFieldInput;
    lockSetupError = '';
    if (lockOldFieldInput.length === 0) return;

    const valid = await appLockStore.verifySecret(lockOldFieldInput);
    if (!valid) {
      lockSetupError = 'Incorrect ' + lockTypeLabel + '. Try again.';
      triggerLockShake();
      lockOldFieldInput = '';
      lockFieldInput = '';
      return;
    }
    // Old secret verified — move to input new secret
    lockSetupStep = 'input';
    lockFieldInput = '';
    lockSetupError = '';
  }

  function lockSetupNext() {
    lockInputValue = lockFieldInput;
    if (lockInputValue.length === 0) return;
    lockSetupStep = 'confirm';
    lockSetupError = '';
  }

  async function lockSetupConfirm() {
    lockConfirmValue = lockFieldInput;
    if (lockInputValue !== lockConfirmValue) {
      lockSetupError = lockTypeLabel.charAt(0).toUpperCase() + lockTypeLabel.slice(1) + 's do not match. Try again.';
      triggerLockShake();
      lockConfirmValue = '';
      lockFieldInput = '';
      lockSetupStep = 'input';
      return;
    }
    try {
      if (lockSetupMode === 'enable') {
        await appLockStore.enableLock(lockInputValue);
        toastStore.show('App Lock enabled', 'success');
      } else {
        await appLockStore.changeSecret(lockInputValue);
        toastStore.show('Lock changed successfully', 'success');
      }
      closeLockSetup();
    } catch {
      toastStore.show('Failed to set lock', 'error');
    }
  }

  function toggleAppLock() {
    if (appLockStore.settings.enabled) {
      openDialog(
        'Disable App Lock?',
        'Anyone with access to your device will be able to open the app without a PIN or password.',
        'Disable',
        true,
        () => {
          appLockStore.disableLock();
          toastStore.show('App Lock disabled', 'success');
        }
      );
    } else {
      openLockSetup('enable');
    }
  }

  function lockNow() {
    appLockStore.lockNow();
    toastStore.show('App locked', 'success');
  }

  // ── Biometric state ──
  $effect(() => {
    if (showLockSecurityPanel && appLockStore.settings.enabled) {
      isBiometricAvailable().then(v => { bioAvail = v; });
    }
  });

  async function toggleBiometric(enable: boolean) {
    if (enable) {
      if (!appLockStore.settings.enabled) return;
      bioBusy = true;
      bioError = '';
      try {
        const uid = authStore.user?.id;
        if (!uid) return;
        const registered = await registerBiometric(uid);
        if (registered) {
          appLockStore.updateSettings({ biometricEnabled: true });
        } else {
          bioError = 'Biometric registration failed. Try again.';
        }
      } catch {
        bioError = 'Biometric registration failed. Try again.';
      } finally {
        bioBusy = false;
      }
    } else {
      showBioConfirm = true;
    }
  }

  async function confirmDisableBio() {
    const uid = authStore.user?.id;
    if (!uid) return;
    appLockStore.updateSettings({ biometricEnabled: false });
    clearBiometric(uid);
    showBioConfirm = false;
  }

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
  const fontSizes: { size: FontSize; label: string; iconSize: number }[] = [
    { size: 'small', label: 'Small', iconSize: 12 },
    { size: 'medium', label: 'Medium', iconSize: 15 },
    { size: 'large', label: 'Large', iconSize: 18 },
  ];

  // ── Bubble styles ──
  const bubbleStyles: { style: BubbleStyle; label: string; icon: typeof Circle }[] = [
    { style: 'round', label: 'Round', icon: Circle },
    { style: 'squircle', label: 'Squircle', icon: Square },
    { style: 'minimal', label: 'Minimal', icon: Minus },
  ];

  // ── Accent color presets ──
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

  // ── Timestamp formats ──
  const timestampFormats: { format: TimestampFormat; label: string; desc: string }[] = [
    { format: 'relative', label: 'Relative', desc: '2m ago, 1h ago' },
    { format: 'absolute', label: 'Absolute', desc: '10:30 AM' },
    { format: 'none', label: 'Hidden', desc: 'No timestamps' },
  ];

  // ── Animation speeds ──
  const animationSpeeds: { speed: AnimationSpeed; label: string; desc: string }[] = [
    { speed: 'reduced', label: 'Reduced', desc: 'Minimal motion' },
    { speed: 'normal', label: 'Normal', desc: 'Default' },
    { speed: 'enhanced', label: 'Enhanced', desc: 'Extra smooth' },
  ];

  // ── Media quality options ──
  const mediaQualityOptions: { quality: MediaQuality; label: string; desc: string }[] = [
    { quality: 'low', label: 'Low', desc: 'Saves data' },
    { quality: 'medium', label: 'Medium', desc: 'Balanced' },
    { quality: 'high', label: 'High', desc: 'Best quality' },
  ];

  // ── Chat sort options ──
  const chatSortOptions: { order: ChatSortOrder; label: string; icon: typeof ArrowUpDown }[] = [
    { order: 'recent', label: 'Recent', icon: Clock },
    { order: 'unread', label: 'Unread', icon: Eye },
    { order: 'alphabetical', label: 'A-Z', icon: ArrowUpDown },
  ];

  // ── Connection & stats ──
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

  let totalChats = $derived(chatStore.userChats.size);
  let cachedMsgCount = $derived(chatStore.messages.length);

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ── Customisation section (collapsed by default) ──
  let showCustomisation = $state(false);

  // ── Advanced section (collapsed by default) ──
  let showAdvanced = $state(false);

  // ── Profile editing state ──
  let isEditingName = $state(false);
  let isEditingUsername = $state(false);
  let editNameValue = $state('');
  let editUsernameValue = $state('');
  let editBioValue = $state('');
  let isUploadingAvatar = $state(false);
  let isSavingProfile = $state(false);

  // Real-time synced profile from userDict (falls back to authStore.user)
  let userProfile = $derived.by(() => {
    if (!authStore.user) return null;
    return chatStore.userDict.get(authStore.user.id) ?? authStore.user;
  });

  let currentBio = $derived(userProfile?.bio || '');
  let currentAccentColor = $derived(userProfile?.accentColor || null);
  let currentAvatarUrl = $derived(userProfile?.avatarUrl || null);

  // Sync editBioValue when currentBio changes externally
  $effect(() => {
    if (!document.activeElement?.classList.contains('bio-textarea')) {
      editBioValue = currentBio;
    }
  });

  // ── Profile actions ──
  async function updateProfile(fields: Record<string, unknown>) {
    if (!authStore.user?.username) return;
    isSavingProfile = true;
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authStore.user.username, ...fields }),
      });
      const data = (await res.json()) as { error?: string; newUsername?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Update failed');
      }
      if (data.newUsername && authStore.user) {
        authStore.user = { ...authStore.user, username: data.newUsername };
      }
      if (fields.displayName && authStore.user) {
        authStore.user = { ...authStore.user, displayName: fields.displayName as string };
      }
      // Optimistically update authStore.user + userDict so derived UI reacts immediately
      if ('accentColor' in fields && authStore.user) {
        const updated = { ...authStore.user, accentColor: fields.accentColor as string | null };
        authStore.user = updated;
        // Also patch userDict so userProfile derived picks it up
        const m = new Map(chatStore.userDict);
        m.set(authStore.user.id, updated);
        chatStore.userDict = m;
        applyLocalAccentColor(fields.accentColor as string | null);
      }
      toastStore.show('Profile updated', 'success');
    } catch (err) {
      toastStore.show(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      isSavingProfile = false;
    }
  }

  function applyLocalAccentColor(color: string | null) {
    const root = document.documentElement;
    if (color) {
      root.style.setProperty('--color-primary', color);
      // Compute a lighter variant for backgrounds
      root.style.setProperty('--color-primary-light', color + '20');
    } else {
      root.style.removeProperty('--color-primary');
      root.style.removeProperty('--color-primary-light');
    }
  }

  // Apply accent color on mount if already set
  $effect(() => {
    if (currentAccentColor) {
      applyLocalAccentColor(currentAccentColor);
    }
  });

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
      } catch {
        toastStore.show('Failed to upload avatar', 'error');
      } finally {
        isUploadingAvatar = false;
      }
    };
    input.click();
  }

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

  function startEditUsername() {
    editUsernameValue = authStore.user?.username || '';
    isEditingUsername = true;
  }

  function cancelEditUsername() {
    isEditingUsername = false;
  }

  async function saveUsername() {
    const val = editUsernameValue.trim().toLowerCase();
    if (!val || val === authStore.user?.username) { isEditingUsername = false; return; }
    await updateProfile({ newUsername: val });
    isEditingUsername = false;
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
    target.style.height = 'auto';
    target.style.height = target.scrollHeight + 'px';
    if (bioTimer) clearTimeout(bioTimer);
    bioTimer = setTimeout(async () => {
      const newBio = editBioValue.trim().slice(0, 120);
      if (newBio !== currentBio) {
        await updateProfile({ bio: newBio });
      }
    }, 800);
  }

  // ── Data management ──
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
        localStorage.removeItem('chat-drafts');
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
        chatStore.messages = [];
        if (authStore.user) chatStore.loadInbox(authStore.user.id);
      }
    );
  }
</script>

<div class="settings-root">
  <!-- Header -->
  <header class="glass-header safe-top settings-header">
    <div class="header-icon-wrap">
      <Settings size={16} color="white" />
    </div>
    <div>
      <h1 class="settings-title">Settings</h1>
      <p class="settings-subtitle">Preferences & account</p>
    </div>
  </header>

  <!-- Scrollable content -->
  <div class="settings-scroll custom-scrollbar">

    <!-- ════════════════════════════════
         PROFILE
         ════════════════════════════════ -->
    <section class="settings-section" style="--delay: 0ms;">
      <span class="section-label">Profile</span>
      <div class="glass card profile-card">

        <!-- Avatar + Name + Username row -->
        <div class="profile-top">
          <button
            class="avatar-wrap"
            onclick={handleAvatarUpload}
            disabled={isUploadingAvatar}
            aria-label="Upload avatar"
          >
            {#if currentAvatarUrl}
              <img src={currentAvatarUrl} alt="Avatar" class="avatar-img" />
            {:else}
              <div class="avatar-fallback">
                {authStore.user?.displayName?.charAt(0).toUpperCase() || '?'}
              </div>
            {/if}
            <div class="avatar-overlay" class:avatar-overlay-visible={isUploadingAvatar}>
              {#if isUploadingAvatar}
                <div class="avatar-spinner"></div>
              {:else}
                <Camera size={18} color="white" />
              {/if}
            </div>
          </button>

          <div class="profile-identity">
            {#if isEditingName}
              <div class="name-edit-row">
                <input
                  type="text"
                  class="name-input"
                  value={editNameValue}
                  maxlength={30}
                  oninput={(e) => editNameValue = (e.target as HTMLInputElement).value}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') saveName();
                    if (e.key === 'Escape') cancelEditName();
                  }}
                  autofocus
                />
                <button class="icon-btn icon-btn-save" onclick={saveName} aria-label="Save name">
                  <Check size={14} />
                </button>
                <button class="icon-btn icon-btn-cancel" onclick={cancelEditName} aria-label="Cancel">
                  <X size={14} />
                </button>
              </div>
            {:else}
              <div class="name-display-row">
                <p class="display-name">{authStore.user?.displayName || 'Unknown'}</p>
                <button class="icon-btn" onclick={startEditName} aria-label="Edit name">
                  <Pencil size={12} />
                </button>
              </div>
            {/if}
            <p class="username" onclick={startEditUsername} role="button" tabindex="0" aria-label="Edit username">
              {#if isEditingUsername}
                <span class="username-edit-inline">
                  <span style="opacity: 0.5;">@</span><input
                    type="text"
                    class="username-input"
                    value={editUsernameValue}
                    maxlength={20}
                    oninput={(e) => editUsernameValue = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9_]/g, '')}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') saveUsername();
                      if (e.key === 'Escape') cancelEditUsername();
                    }}
                    autofocus
                  />
                  <button class="icon-btn icon-btn-save" onclick={(e) => { e.stopPropagation(); saveUsername(); }} aria-label="Save username">
                    <Check size={11} />
                  </button>
                  <button class="icon-btn icon-btn-cancel" onclick={(e) => { e.stopPropagation(); cancelEditUsername(); }} aria-label="Cancel">
                    <X size={11} />
                  </button>
                </span>
              {:else}
                <span>@{authStore.user?.username || 'unknown'}</span>
                <Pencil size={10} class="username-edit-icon" />
              {/if}
            </p>
          </div>
        </div>

        <!-- Bio -->
        <div class="bio-area">
          <textarea
            class="bio-textarea"
            placeholder="Write a short bio..."
            maxlength={120}
            value={editBioValue}
            oninput={handleBioInput}
            onblur={handleBioBlur}
            rows={1}
          ></textarea>
          <p class="bio-counter" class:bio-counter-warn={editBioValue.length > 108}>
            {editBioValue.length}/120
          </p>
        </div>

        <!-- Accent Color -->
        <div class="horiz-section">
          <span class="horiz-label"><Palette size={12} /> Accent</span>
          <div class="color-grid">
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
                    <Check size={14} color={c.value || 'white'} style="position: relative; z-index: 1;" />
                  {/if}
                </div>
                <span class="color-label">{c.label}</span>
              </button>
            {/each}
          </div>
        </div>

      </div>
    </section>

    <!-- ════════════════════════════════
         APPEARANCE
         ════════════════════════════════ -->
    <section class="settings-section" style="--delay: 40ms;">
      <span class="section-label">Appearance</span>
      <div class="glass card appearance-card">

        <!-- Theme picker -->
        <div class="theme-grid">
          {#each themes as theme (theme.mode)}
            {@const isActive = themeManager.currentTheme === theme.mode}
            <button
              class="theme-option"
              class:theme-option-active={isActive}
              onclick={() => themeManager.setTheme(theme.mode)}
            >
              <div
                class="theme-preview"
                style="background: {isActive ? 'rgba(255,255,255,0.2)' : theme.gradient};"
              >
                <theme.icon size={16} />
              </div>
              <span class="theme-name">{theme.label}</span>
              {#if isActive}
                <div class="theme-check">
                  <Check size={8} style="color: var(--color-primary);" />
                </div>
              {:else}
                <div class="theme-check-spacer"></div>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Font Size -->
        <div class="option-row-header"><Type size={12} /> Message Size</div>
        <div class="btn-group">
          {#each fontSizes as f (f.size)}
            {@const isActive = prefsStore.fontSize === f.size}
            <button
              class="btn-option"
              class:btn-option-active={isActive}
              onclick={() => prefsStore.setFontSize(f.size)}
            >
              <ALargeSmall size={f.iconSize} />
              {f.label}
            </button>
          {/each}
        </div>

        <!-- Bubble Style -->
        <div class="option-row-header"><MessageSquare size={12} /> Bubble Style</div>
        <div class="btn-group">
          {#each bubbleStyles as b (b.style)}
            {@const isActive = prefsStore.bubbleStyle === b.style}
            <button
              class="btn-option"
              class:btn-option-active={isActive}
              onclick={() => prefsStore.setBubbleStyle(b.style)}
            >
              <b.icon size={13} />
              {b.label}
            </button>
          {/each}
        </div>

        <!-- Compact Mode -->
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-icon" style="background: color-mix(in srgb, var(--color-accent) 12%, transparent);">
              <LayoutGrid size={15} style="color: var(--color-accent);" />
            </div>
            <div>
              <p class="toggle-title">Compact Mode</p>
              <p class="toggle-desc">Smaller avatars & spacing</p>
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

        <!-- Enter to Send -->
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-icon" style="background: color-mix(in srgb, var(--color-accent) 12%, transparent);">
              <Type size={15} style="color: var(--color-accent);" />
            </div>
            <div>
              <p class="toggle-title">Enter to Send</p>
              <p class="toggle-desc">Press Enter to send messages</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={prefsStore.enterSend}
            onclick={() => prefsStore.setEnterSend(!prefsStore.enterSend)}
            role="switch"
            aria-checked={prefsStore.enterSend}
            aria-label="Toggle enter to send"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

      </div>
    </section>

    <!-- ════════════════════════════════
         PRIVACY & REALTIME
         ════════════════════════════════ -->
    <section class="settings-section" style="--delay: 60ms;">
      <span class="section-label">Privacy & Realtime</span>
      <div class="glass card">

        <!-- Send Read Receipts -->
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-icon" style="background: color-mix(in srgb, var(--color-primary) 12%, transparent);">
              <Eye size={15} style="color: var(--color-primary);" />
            </div>
            <div>
              <p class="toggle-title">Read Receipts</p>
              <p class="toggle-desc">Show when you've read messages</p>
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

        <div class="toggle-divider"></div>

        <!-- Send Typing Indicators -->
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-icon" style="background: color-mix(in srgb, var(--color-accent) 12%, transparent);">
              <Timer size={15} style="color: var(--color-accent);" />
            </div>
            <div>
              <p class="toggle-title">Typing Indicator</p>
              <p class="toggle-desc">Show when you're typing a message</p>
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

        <div class="toggle-divider"></div>

        <!-- Notification Sounds -->
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-icon" style="background: color-mix(in srgb, #06b6d4 12%, transparent);">
              <Volume2 size={15} style="color: #06b6d4;" />
            </div>
            <div>
              <p class="toggle-title">Notification Sounds</p>
              <p class="toggle-desc">Play sounds for new messages</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={prefsStore.notificationSounds}
            onclick={() => prefsStore.setNotificationSounds(!prefsStore.notificationSounds)}
            role="switch"
            aria-checked={prefsStore.notificationSounds}
            aria-label="Toggle notification sounds"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <!-- Privacy notice -->
        <div class="privacy-notice">
          <Shield size={11} style="color: var(--text-tertiary); flex-shrink: 0; margin-top: 1px;" />
          <span>These settings only affect what others see about you. You can always see others' status regardless of your own settings.</span>
        </div>

      </div>
    </section>

    <!-- ════════════════════════════════
         TIME & DATE
         ════════════════════════════════ -->
    <section class="settings-section" style="--delay: 70ms;">
      <span class="section-label">Time & Date</span>
      <div class="glass card">

        <!-- 24-Hour Format -->
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-icon" style="background: color-mix(in srgb, #8b5cf6 12%, transparent);">
              <Globe size={15} style="color: #8b5cf6;" />
            </div>
            <div>
              <p class="toggle-title">24-Hour Time</p>
              <p class="toggle-desc">Use 24h format (14:30) instead of 12h (2:30 PM)</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={prefsStore.use24HourFormat}
            onclick={() => prefsStore.setUse24HourFormat(!prefsStore.use24HourFormat)}
            role="switch"
            aria-checked={prefsStore.use24HourFormat}
            aria-label="Toggle 24-hour time format"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <div class="toggle-divider"></div>

        <!-- Show Absolute Last Seen -->
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-icon" style="background: color-mix(in srgb, #f59e0b 12%, transparent);">
              <Clock size={15} style="color: #f59e0b;" />
            </div>
            <div>
              <p class="toggle-title">Absolute Last Seen</p>
              <p class="toggle-desc">Show exact time instead of "5 min ago"</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={prefsStore.showAbsoluteLastSeen}
            onclick={() => prefsStore.setShowAbsoluteLastSeen(!prefsStore.showAbsoluteLastSeen)}
            role="switch"
            aria-checked={prefsStore.showAbsoluteLastSeen}
            aria-label="Toggle absolute last seen time"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

      </div>
    </section>

    <!-- ════════════════════════════════
         APP LOCK — Security Shield
         ════════════════════════════════ -->
    <section class="settings-section" style="--delay: 75ms;">
      <span class="section-label">Security</span>
      <div class="glass card">

        <!-- Security status header -->
        <div class="security-header">
          <div class="security-shield" class:security-shield-locked={appLockStore.settings.enabled}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              {#if appLockStore.settings.enabled}
                <path d="M20 6L9 17l-5-5" style="stroke-dasharray: 30; animation: checkDraw 0.5s ease forwards;" />
              {:else}
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              {/if}
            </svg>
          </div>
          <div class="security-status-text">
            <p class="security-status-title">{appLockStore.settings.enabled ? 'App Lock Active' : 'App Lock Off'}</p>
            <p class="security-status-sub">{appLockStore.settings.enabled ? 'Your chats are protected with ' + lockTypeLabel : 'Protect your chats with a PIN or password'}</p>
          </div>
        </div>

        <!-- Main toggle -->
        <div class="toggle-row" style="margin-top: 12px;">
          <div class="toggle-info">
            <div>
              <p class="toggle-title">Enable App Lock</p>
              <p class="toggle-desc">{appLockStore.settings.enabled ? 'Lock is active — disable to remove protection' : 'Require ' + lockTypeLabel + ' to open the app'}</p>
            </div>
          </div>
          <button
            class="toggle-track"
            class:toggle-on={appLockStore.settings.enabled}
            onclick={toggleAppLock}
            role="switch"
            aria-checked={appLockStore.settings.enabled}
            aria-label="Toggle app lock"
          >
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <!-- Security settings (only when enabled) -->
        {#if appLockStore.settings.enabled}
          <button
            class="security-panel-toggle"
            onclick={() => showLockSecurityPanel = !showLockSecurityPanel}
            aria-expanded={showLockSecurityPanel}
          >
            <span>Security Settings</span>
            <ChevronDown
              size={14}
              style="color: var(--text-tertiary); transition: transform 300ms ease; transform: rotate({showLockSecurityPanel ? 180 : 0}deg);"
            />
          </button>

          {#if showLockSecurityPanel}
            <div class="security-panel" style="animation: fadeSlideIn 200ms ease forwards;">
              <!-- Lock type -->
              <div class="security-row">
                <div class="security-row-header">
                  <div class="security-row-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <p class="security-row-label">Lock Type</p>
                </div>
                <div class="security-chips">
                  {#each lockTypes as lt}
                    <button
                      class="security-chip"
                      class:security-chip-active={appLockStore.settings.lockType === lt.type}
                      onclick={() => appLockStore.updateSettings({ lockType: lt.type })}
                    >
                      {lt.label}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="security-row-divider"></div>

              <!-- Change PIN / Password -->
              <button class="security-action-row" onclick={() => openLockSetup('change')}>
                <div class="security-row-header">
                  <div class="security-row-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </div>
                  <p class="security-row-label">Change {lockTypeLabel.charAt(0).toUpperCase() + lockTypeLabel.slice(1)}</p>
                </div>
                <ChevronRight size={14} style="color: var(--text-tertiary);" />
              </button>

              <div class="security-row-divider"></div>

              <!-- Auto-lock -->
              <div class="security-row">
                <div class="security-row-header">
                  <div class="security-row-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <p class="security-row-label">Auto-Lock</p>
                </div>
                <div class="security-chips" style="flex-wrap: wrap;">
                  {#each autoLockOptions as opt}
                    <button
                      class="security-chip security-chip-sm"
                      class:security-chip-active={appLockStore.settings.autoLock === opt.value}
                      onclick={() => appLockStore.updateSettings({ autoLock: opt.value })}
                    >
                      {opt.label}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="security-row-divider"></div>

              <!-- Lock on startup -->
              <div class="security-row">
                <div class="security-row-header">
                  <div class="security-row-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                  </div>
                  <p class="security-row-label">Lock on Startup</p>
                </div>
                <button
                  class="toggle-track"
                  class:toggle-on={appLockStore.settings.lockOnStartup}
                  onclick={() => appLockStore.updateSettings({ lockOnStartup: !appLockStore.settings.lockOnStartup })}
                  role="switch"
                  aria-checked={appLockStore.settings.lockOnStartup}
                  aria-label="Toggle lock on startup"
                >
                  <div class="toggle-thumb"></div>
                </button>
              </div>

              <div class="security-row-divider"></div>

              <!-- Lock Now -->
              <button class="security-action-row" onclick={lockNow}>
                <div class="security-row-header">
                  <div class="security-row-icon" style="background: color-mix(in srgb, #ef4444 12%, transparent);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <p class="security-row-label" style="color: var(--color-danger);">Lock Now</p>
                </div>
                <ChevronRight size={14} style="color: var(--text-tertiary);" />
              </button>

              <!-- Biometric Unlock (shown when lock enabled + biometric available) -->
              {#if bioAvail}
                <div class="security-row-divider"></div>
                <div class="security-row">
                  <div style="flex: 1; min-width: 0;">
                    <div class="security-row-header">
                      <div class="security-row-icon" style="background: color-mix(in srgb, var(--color-primary) 12%, transparent);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
                          <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
                          <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
                          <path d="M2 12a10 10 0 0 1 18-6" />
                          <path d="M2 16h.01" />
                          <path d="M21.8 16c.2-2 .131-5.354 0-6" />
                          <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
                          <path d="M8.65 22c.21-.66.45-1.32.57-2" />
                          <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
                        </svg>
                      </div>
                      <p class="security-row-label">Biometric Unlock</p>
                    </div>
                    <p class="security-row-desc">Use fingerprint or face to unlock</p>
                    {#if bioError}
                      <p style="font-size: 11px; color: var(--color-danger); margin-top: 4px;">{bioError}</p>
                    {/if}
                  </div>
                  <button
                    class="toggle-track"
                    class:toggle-on={appLockStore.settings.biometricEnabled}
                    disabled={bioBusy}
                    onclick={() => toggleBiometric(!appLockStore.settings.biometricEnabled)}
                    role="switch"
                    aria-checked={appLockStore.settings.biometricEnabled}
                    aria-label="Toggle biometric unlock"
                  >
                    <div class="toggle-thumb"></div>
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    </section>

    <!-- ════════════════════════════════
         CUSTOMISATION (collapsible dropdown)
         ════════════════════════════════ -->
    <section class="settings-section" style="--delay: 80ms;">
      <button
        class="advanced-toggle"
        onclick={() => showCustomisation = !showCustomisation}
        aria-expanded={showCustomisation}
        aria-controls="customisation-content"
      >
        <span class="section-label" style="margin-bottom: 0;">Customisation</span>
        <ChevronDown
          size={14}
          style="color: var(--text-tertiary); transition: transform 300ms ease; transform: rotate({showCustomisation ? 180 : 0}deg);"
        />
      </button>

      <div
        id="customisation-content"
        class="advanced-collapse"
        class:advanced-collapse-open={showCustomisation}
        role="region"
      >
        <div class="glass card">

          <!-- Timestamp Format -->
          <div class="option-row-header"><Clock size={12} /> Timestamps</div>
          <div class="btn-group">
            {#each timestampFormats as t (t.format)}
              {@const isActive = prefsStore.timestampFormat === t.format}
              <button
                class="btn-option btn-option-desc-btn"
                class:btn-option-active={isActive}
                onclick={() => prefsStore.setTimestampFormat(t.format)}
              >
                <span class="btn-option-label">{t.label}</span>
                <span class="btn-option-sub">{t.desc}</span>
              </button>
            {/each}
          </div>

          <!-- Animation Speed -->
          <div class="option-row-header"><Zap size={12} /> Animations</div>
          <div class="btn-group">
            {#each animationSpeeds as a (a.speed)}
              {@const isActive = prefsStore.animationSpeed === a.speed}
              <button
                class="btn-option btn-option-desc-btn"
                class:btn-option-active={isActive}
                onclick={() => prefsStore.setAnimationSpeed(a.speed)}
              >
                <span class="btn-option-label">{a.label}</span>
                <span class="btn-option-sub">{a.desc}</span>
              </button>
            {/each}
          </div>

          <!-- Chat List Sort Order -->
          <div class="option-row-header"><ArrowUpDown size={12} /> Chat List Order</div>
          <div class="btn-group">
            {#each chatSortOptions as s (s.order)}
              {@const isActive = prefsStore.chatSortOrder === s.order}
              <button
                class="btn-option"
                class:btn-option-active={isActive}
                onclick={() => prefsStore.setChatSortOrder(s.order)}
              >
                <s.icon size={13} />
                {s.label}
              </button>
            {/each}
          </div>

          <!-- Media Quality -->
          <div class="option-row-header"><Image size={12} /> Media Quality</div>
          <div class="btn-group">
            {#each mediaQualityOptions as m (m.quality)}
              {@const isActive = prefsStore.mediaQuality === m.quality}
              <button
                class="btn-option btn-option-desc-btn"
                class:btn-option-active={isActive}
                onclick={() => prefsStore.setMediaQuality(m.quality)}
              >
                <span class="btn-option-label">{m.label}</span>
                <span class="btn-option-sub">{m.desc}</span>
              </button>
            {/each}
          </div>

          <div class="toggle-divider"></div>

          <!-- Show Link Previews -->
          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-icon" style="background: color-mix(in srgb, #06b6d4 12%, transparent);">
                <Link2 size={15} style="color: #06b6d4;" />
              </div>
              <div>
                <p class="toggle-title">Link Previews</p>
                <p class="toggle-desc">Show URL previews in messages</p>
              </div>
            </div>
            <button
              class="toggle-track"
              class:toggle-on={prefsStore.showLinkPreviews}
              onclick={() => prefsStore.setShowLinkPreviews(!prefsStore.showLinkPreviews)}
              role="switch"
              aria-checked={prefsStore.showLinkPreviews}
              aria-label="Toggle link previews"
            >
              <div class="toggle-thumb"></div>
            </button>
          </div>

          <div class="toggle-divider"></div>

          <!-- Message Grouping -->
          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-icon" style="background: color-mix(in srgb, var(--color-accent) 12%, transparent);">
                <Layers size={15} style="color: var(--color-accent);" />
              </div>
              <div>
                <p class="toggle-title">Group Messages</p>
                <p class="toggle-desc">Combine consecutive messages</p>
              </div>
            </div>
            <button
              class="toggle-track"
              class:toggle-on={prefsStore.groupMessages}
              onclick={() => prefsStore.setGroupMessages(!prefsStore.groupMessages)}
              role="switch"
              aria-checked={prefsStore.groupMessages}
              aria-label="Toggle message grouping"
            >
              <div class="toggle-thumb"></div>
            </button>
          </div>

          <div class="toggle-divider"></div>

          <!-- Show Avatars in Chat -->
          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-icon" style="background: color-mix(in srgb, #8b5cf6 12%, transparent);">
                <Users size={15} style="color: #8b5cf6;" />
              </div>
              <div>
                <p class="toggle-title">Show Avatars</p>
                <p class="toggle-desc">Display user avatars in chat</p>
              </div>
            </div>
            <button
              class="toggle-track"
              class:toggle-on={prefsStore.showAvatarsInChat}
              onclick={() => prefsStore.setShowAvatarsInChat(!prefsStore.showAvatarsInChat)}
              role="switch"
              aria-checked={prefsStore.showAvatarsInChat}
              aria-label="Toggle avatars in chat"
            >
              <div class="toggle-thumb"></div>
            </button>
          </div>

          <div class="toggle-divider"></div>

          <!-- Auto-play Media -->
          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-icon" style="background: color-mix(in srgb, #f97316 12%, transparent);">
                <Play size={15} style="color: #f97316;" />
              </div>
              <div>
                <p class="toggle-title">Auto-play Media</p>
                <p class="toggle-desc">Play GIFs & videos automatically</p>
              </div>
            </div>
            <button
              class="toggle-track"
              class:toggle-on={prefsStore.autoPlayMedia}
              onclick={() => prefsStore.setAutoPlayMedia(!prefsStore.autoPlayMedia)}
              role="switch"
              aria-checked={prefsStore.autoPlayMedia}
              aria-label="Toggle auto-play media"
            >
              <div class="toggle-thumb"></div>
            </button>
          </div>

          <div class="toggle-divider"></div>

          <!-- Easter Egg Effects -->
          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-icon" style="background: color-mix(in srgb, #ec4899 12%, transparent);">
                <SparkleIcon size={15} style="color: #ec4899;" />
              </div>
              <div>
                <p class="toggle-title">Easter Egg Effects</p>
                <p class="toggle-desc">Double-tap particle animations</p>
              </div>
            </div>
            <button
              class="toggle-track"
              class:toggle-on={prefsStore.showEasterEggs}
              onclick={() => prefsStore.setShowEasterEggs(!prefsStore.showEasterEggs)}
              role="switch"
              aria-checked={prefsStore.showEasterEggs}
              aria-label="Toggle easter egg effects"
            >
              <div class="toggle-thumb"></div>
            </button>
          </div>

          <div class="toggle-divider"></div>

          <!-- Wallpaper Opacity Slider -->
          <div class="slider-row">
            <div class="toggle-info">
              <div class="toggle-icon" style="background: color-mix(in srgb, var(--color-primary) 12%, transparent);">
                <Ghost size={15} style="color: var(--color-primary);" />
              </div>
              <div>
                <p class="toggle-title">Wallpaper Opacity</p>
                <p class="toggle-desc">{prefsStore.chatWallpaperOpacity}%</p>
              </div>
            </div>
            <div class="slider-wrap">
              <input
                type="range"
                class="custom-slider"
                min="10"
                max="100"
                step="5"
                value={prefsStore.chatWallpaperOpacity}
                oninput={(e) => prefsStore.setChatWallpaperOpacity(Number((e.target as HTMLInputElement).value))}
                aria-label="Wallpaper opacity"
              />
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- ════════════════════════════════
         ADVANCED (collapsible)
         ════════════════════════════════ -->
    <section class="settings-section" style="--delay: 120ms;">
      <button
        class="advanced-toggle"
        onclick={() => showAdvanced = !showAdvanced}
        aria-expanded={showAdvanced}
        aria-controls="advanced-content"
      >
        <span class="section-label" style="margin-bottom: 0;">Advanced</span>
        <ChevronDown
          size={14}
          style="color: var(--text-tertiary); transition: transform 300ms ease; transform: rotate({showAdvanced ? 180 : 0}deg);"
        />
      </button>

      <div
        id="advanced-content"
        class="advanced-collapse"
        class:advanced-collapse-open={showAdvanced}
        role="region"
      >
        <div class="glass card">

          <!-- Connection Status -->
          <div class="info-row">
            <div class="info-left">
              <div class="info-icon" style="background: color-mix(in srgb, {connColor} 12%, transparent);">
                {#if connState === 'active'}
                  <Wifi size={15} style="color: {connColor};" />
                {:else}
                  <WifiOff size={15} style="color: {connColor};" />
                {/if}
              </div>
              <div>
                <p class="info-title">Connection</p>
                <p class="info-desc">Firebase RTDB</p>
              </div>
            </div>
            <div class="conn-badge">
              <div class="conn-dot" style="background: {connColor}; box-shadow: 0 0 6px {connColor};"></div>
              <span class="conn-text" style="color: {connColor};">{connLabel}</span>
            </div>
          </div>

          <div class="toggle-divider"></div>

          <!-- Last Sync -->
          <div class="info-row">
            <div class="info-left">
              <div class="info-icon" style="background: var(--input-bg);">
                <Clock size={15} style="color: var(--text-secondary);" />
              </div>
              <div>
                <p class="info-title">Last Synced</p>
                <p class="info-desc">Last data refresh</p>
              </div>
            </div>
            <span class="info-value">{formatTime(lastSync)}</span>
          </div>

          <div class="toggle-divider"></div>

          <!-- Cached Data -->
          <div class="info-row">
            <div class="info-left">
              <div class="info-icon" style="background: var(--input-bg);">
                <Activity size={15} style="color: var(--text-secondary);" />
              </div>
              <div>
                <p class="info-title">Cached Data</p>
                <p class="info-desc">{totalChats} chats, {cachedMsgCount} messages</p>
              </div>
            </div>
          </div>

          <div class="toggle-divider"></div>

          <!-- Version -->
          <div class="info-row">
            <div class="info-left">
              <div class="info-icon" style="background: var(--input-bg);">
                <Sparkles size={15} style="color: var(--text-secondary);" />
              </div>
              <span class="info-title">Version</span>
            </div>
            <span class="version-badge">v1.2.0</span>
          </div>

          <div class="toggle-divider"></div>

          <!-- Storage -->
          <div class="info-row">
            <div class="info-left">
              <div class="info-icon" style="background: var(--input-bg);">
                <Lock size={15} style="color: var(--text-secondary);" />
              </div>
              <div>
                <p class="info-title">Storage</p>
                <p class="info-desc">Local & encrypted in transit</p>
              </div>
            </div>
            <ChevronRight size={15} style="color: var(--text-tertiary);" />
          </div>

          <div class="toggle-divider"></div>

          <!-- Clear Chat Cache -->
          <button class="action-row action-row-warn" onclick={clearChatCache}>
            <div class="info-left">
              <div class="info-icon" style="background: color-mix(in srgb, var(--color-warning) 12%, transparent);">
                <Trash2 size={15} style="color: var(--color-warning);" />
              </div>
              <span class="info-title">Clear Chat Cache</span>
            </div>
            <span class="info-value">{cachedMsgCount} messages</span>
          </button>

          <div class="toggle-divider"></div>

          <!-- Reset All Preferences -->
          <button class="action-row action-row-danger" onclick={clearCache}>
            <div class="info-left">
              <div class="info-icon" style="background: color-mix(in srgb, var(--color-danger) 12%, transparent);">
                <Trash2 size={15} style="color: var(--color-danger);" />
              </div>
              <span class="info-title">Reset All Preferences</span>
            </div>
            <span class="info-value">Restores defaults</span>
          </button>

        </div>
      </div>
    </section>

    <!-- ════════════════════════════════
         SIGN OUT
         ════════════════════════════════ -->
    <section class="settings-section" style="--delay: 200ms;">
      <button
        class="logout-btn glass"
        onclick={handleLogout}
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </section>

  </div>
</div>

<!-- ════════════════════════════════
     CONFIRMATION DIALOG
     ════════════════════════════════ -->
{#if showLockSetup}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-overlay"
    onclick={closeLockSetup}
    role="dialog"
    aria-modal="true"
    aria-label="Set up App Lock"
  >
    <div class="dialog-card lock-dialog-card" class:lock-dialog-shake={lockSetupShaking} onclick={(e) => e.stopPropagation()} style="max-width: 360px;">
      <!-- Step indicator dots -->
      <div class="lock-step-dots">
        {#if lockSetupMode === 'change'}
          <div class="lock-step-dot" class:lock-step-dot-done={lockSetupStep === 'input' || lockSetupStep === 'confirm'}></div>
        {/if}
        <div class="lock-step-dot" class:lock-step-dot-active={lockSetupStep === 'verify' || lockSetupStep === 'input'}></div>
        <div class="lock-step-dot" class:lock-step-dot-active={lockSetupStep === 'confirm'}></div>
      </div>

      <!-- Lock icon with step-based color -->
      <div class="dialog-icon-wrap" style="background: {lockSetupStep === 'verify' ? 'color-mix(in srgb, #f59e0b 15%, transparent)' : 'color-mix(in srgb, #6366f1 15%, transparent)'};">
        {#if lockSetupStep === 'verify'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        {/if}
      </div>

      <h3 class="dialog-title">
        {#if lockSetupStep === 'verify'}
          Verify Current {lockTypeLabel.charAt(0).toUpperCase() + lockTypeLabel.slice(1)}
        {:else if lockSetupStep === 'input'}
          {lockSetupMode === 'enable' ? 'Set Up App Lock' : 'Enter New ' + lockTypeLabel.charAt(0).toUpperCase() + lockTypeLabel.slice(1)}
        {:else}
          Confirm {lockTypeLabel.charAt(0).toUpperCase() + lockTypeLabel.slice(1)}
        {/if}
      </h3>
      <p class="dialog-message">
        {#if lockSetupStep === 'verify'}
          Enter your current {lockTypeLabel} to continue
        {:else if lockSetupStep === 'input'}
          Choose a {appLockStore.settings.lockType === 'pin4' ? '4-digit PIN' : appLockStore.settings.lockType === 'pin6' ? '6-digit PIN' : 'strong password'}
        {:else}
          Re-enter your {lockTypeLabel} to confirm
        {/if}
      </p>

      <!-- Error message -->
      {#if lockSetupError}
        <p class="lock-error-text">{lockSetupError}</p>
      {/if}

      <div class="lock-setup-input-wrap">
        <input
          type={appLockStore.settings.lockType === 'password' ? 'text' : 'tel'}
          inputmode={appLockStore.settings.lockType === 'password' ? 'text' : 'numeric'}
          class="lock-setup-input"
          placeholder={appLockStore.settings.lockType === 'pin4' ? '••••' : appLockStore.settings.lockType === 'pin6' ? '••••••' : 'Enter password'}
          maxlength={lockTypeMaxLength}
          bind:value={lockFieldInput}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              if (lockSetupStep === 'verify') lockSetupVerifyOld();
              else if (lockSetupStep === 'input') lockSetupNext();
              else lockSetupConfirm();
            }
          }}
          autofocus
        />
      </div>

      <div class="dialog-actions" style="margin-top: 16px;">
        <button class="dialog-cancel" onclick={closeLockSetup}>Cancel</button>
        {#if lockSetupStep === 'verify'}
          <button class="dialog-confirm" onclick={lockSetupVerifyOld} disabled={lockFieldInput.length === 0}>
            Verify
          </button>
        {:else if lockSetupStep === 'input'}
          <button class="dialog-confirm" onclick={lockSetupNext} disabled={lockFieldInput.length === 0}>
            Next
          </button>
        {:else}
          <button class="dialog-confirm" onclick={lockSetupConfirm} disabled={lockFieldInput.length === 0}>
            Confirm
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Biometric disable confirmation -->
{#if showBioConfirm}
  <div
    class="dialog-overlay"
    onclick={() => showBioConfirm = false}
    role="dialog"
    aria-modal="true"
    style="animation: fadeIn 200ms ease forwards;"
  >
    <div class="dialog-card" style="animation: lockDialogShake 0s; max-width: 320px;" onclick={(e) => e.stopPropagation()}>
      <h3 class="dialog-title">Disable Biometric Unlock?</h3>
      <p class="dialog-desc" style="font-size: 13px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5;">
        You'll need to enter your {lockTypeLabel} to unlock the app. Enable biometrics again anytime in settings.
      </p>
      <div class="dialog-actions" style="margin-top: 16px;">
        <button class="dialog-cancel" onclick={() => showBioConfirm = false}>Cancel</button>
        <button class="dialog-confirm" onclick={confirmDisableBio} style="background: var(--color-danger);">Disable</button>
      </div>
    </div>
  </div>
{/if}

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
  /* ════════════════════════════════
     LAYOUT
     ════════════════════════════════ */
  .settings-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--bg-page);
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 56px;
    min-height: 56px;
    z-index: 50;
  }

  .header-icon-wrap {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    flex-shrink: 0;
  }

  .settings-title {
    font-size: 17px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text-primary);
  }

  .settings-subtitle {
    font-size: 11px;
    line-height: 1.2;
    color: var(--text-tertiary);
  }

  .settings-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px 100px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ════════════════════════════════
     SECTIONS & CARDS
     ════════════════════════════════ */
  .settings-section {
    animation: sectionSlideIn 450ms cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--delay, 0ms);
  }

  @keyframes sectionSlideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .section-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-tertiary);
    margin-bottom: 8px;
    padding-left: 2px;
  }

  .card {
    border-radius: var(--radius-lg);
    padding: 16px;
  }

  /* ════════════════════════════════
     PROFILE
     ════════════════════════════════ */
  .profile-top {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .avatar-wrap {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 18px;
    overflow: hidden;
    flex-shrink: 0;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms ease;
  }

  .avatar-wrap:active {
    transform: scale(0.96);
  }

  .avatar-img {
    width: 64px;
    height: 64px;
    border-radius: 18px;
    object-fit: cover;
    display: block;
  }

  .avatar-fallback {
    width: 64px;
    height: 64px;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 24px;
    color: white;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .avatar-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 18px;
    opacity: 0;
    transition: opacity 250ms ease;
    pointer-events: none;
  }

  .avatar-wrap:hover .avatar-overlay {
    opacity: 1;
  }

  .avatar-overlay-visible {
    opacity: 1 !important;
  }

  .avatar-spinner {
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

  .profile-identity {
    min-width: 0;
    flex: 1;
    padding-top: 2px;
  }

  .display-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .username {
    font-size: 13px;
    color: var(--text-tertiary);
    line-height: 1.3;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: color 150ms ease;
    min-height: 20px;
  }
  .username:hover { color: var(--text-secondary); }

  .username-edit-icon {
    opacity: 0.5;
    transition: opacity 150ms ease;
  }
  .username:hover .username-edit-icon { opacity: 1; }

  .username-edit-inline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--text-primary);
  }

  .username-input {
    background: var(--input-bg);
    border: 1.5px solid var(--color-primary);
    border-radius: 8px;
    padding: 2px 6px;
    font-size: 13px;
    color: var(--text-primary);
    outline: none;
    width: 120px;
    font-family: inherit;
  }

  .name-display-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 1px;
  }

  .name-edit-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 1px;
  }

  .name-input {
    flex: 1;
    min-width: 0;
    background: var(--input-bg);
    border: 1.5px solid var(--color-primary);
    border-radius: 8px;
    padding: 3px 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    outline: none;
    font-family: inherit;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: none;
    background: var(--input-bg);
    color: var(--text-tertiary);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .icon-btn:active {
    transform: scale(0.88);
  }

  .icon-btn-save {
    color: var(--color-primary);
  }

  .icon-btn-cancel {
    color: var(--text-tertiary);
  }

  /* Bio */
  .bio-area {
    margin-top: 12px;
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

  .bio-counter {
    text-align: right;
    font-size: 10px;
    color: var(--text-tertiary);
    margin-top: 3px;
    transition: color 200ms ease;
  }

  .bio-counter-warn {
    color: var(--color-danger);
  }

  /* Horizontal scroll sections (emoji + color) */
  .horiz-section {
    margin-top: 14px;
  }

  .horiz-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
    margin-bottom: 8px;
  }

  .color-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 14px;
  }

  .color-circle-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    cursor: pointer;
    border: none;
    background: none;
    padding: 4px;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .color-circle-wrap:active {
    transform: scale(0.88);
  }

  .color-circle {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 200ms ease;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  .color-circle-active {
    transform: scale(1.1);
  }

  .color-label {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  /* ════════════════════════════════
     APPEARANCE
     ════════════════════════════════ */
  .appearance-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .theme-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 10px 4px 8px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .theme-option:active {
    transform: scale(0.95);
  }

  .theme-option-active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-foreground);
    box-shadow: 0 2px 12px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  .theme-preview {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .theme-name {
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .theme-check {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary-foreground);
  }

  .theme-check-spacer {
    width: 14px;
    height: 14px;
  }

  .option-row-header {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
    margin-bottom: -6px;
  }

  .btn-group {
    display: flex;
    gap: 8px;
  }

  .btn-option {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 9px 8px;
    border-radius: var(--radius-md);
    font-size: 12px;
    font-weight: 600;
    border: 1.5px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .btn-option:active {
    transform: scale(0.95);
  }

  .btn-option-active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-foreground);
  }

  /* ════════════════════════════════
     TOGGLE ROWS (shared by Chats & Appearance)
     ════════════════════════════════ */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
  }

  .toggle-divider {
    height: 1px;
    background: var(--border-subtle);
  }

  .toggle-info {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .toggle-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .toggle-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .toggle-desc {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.3;
  }

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
    transform: scale(0.93);
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
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .toggle-on .toggle-thumb {
    transform: translateX(18px);
  }

  /* ════════════════════════════════
     ADVANCED (collapsible)
     ════════════════════════════════ */
  .advanced-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .advanced-collapse {
    max-height: 0;
    overflow: hidden;
    transition: max-height 400ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease;
    opacity: 0;
    margin-top: 0;
  }

  .advanced-collapse-open {
    max-height: 600px;
    opacity: 1;
    margin-top: 8px;
  }

  /* Info rows (Advanced section) */
  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
  }

  .info-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .info-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .info-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .info-desc {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.3;
  }

  .info-value {
    font-size: 12px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .conn-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

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

  .conn-text {
    font-size: 12px;
    font-weight: 600;
  }

  .version-badge {
    font-size: 11px;
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    padding: 3px 8px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 0;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .action-row:active {
    background: var(--input-bg);
    border-radius: var(--radius-sm);
  }

  /* ════════════════════════════════
     LOGOUT
     ════════════════════════════════ */
  .logout-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 48px;
    border-radius: var(--radius-lg);
    font-size: 14px;
    font-weight: 600;
    background: color-mix(in srgb, var(--color-danger) 8%, transparent);
    color: var(--color-danger);
    border-color: color-mix(in srgb, var(--color-danger) 12%, transparent);
    cursor: pointer;
    transition: all 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .logout-btn:active {
    transform: scale(0.97);
  }

  /* ════════════════════════════════
     DIALOG
     ════════════════════════════════ */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--overlay-bg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    animation: overlayIn 250ms ease both;
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
    animation: dialogSpring 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
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

  /* ════════════════════════════════
     PRIVACY NOTICE
     ════════════════════════════════ */
  .privacy-notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--text-tertiary) 6%, transparent);
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-tertiary);
  }

  /* ════════════════════════════════
     CUSTOMISATION CARD
     ════════════════════════════════ */
  .customisation-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .btn-option-desc-btn {
    flex-direction: column;
    gap: 1px;
    padding: 8px 6px;
    align-items: center;
  }

  .btn-option-label {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
  }

  .btn-option-sub {
    font-size: 9px;
    font-weight: 400;
    opacity: 0.65;
    line-height: 1.2;
  }

  /* ════════════════════════════════
     SLIDER
     ════════════════════════════════ */
  .slider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    gap: 12px;
  }

  .slider-wrap {
    flex-shrink: 0;
    width: 120px;
  }

  .custom-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--input-bg);
    outline: none;
    cursor: pointer;
    transition: background 200ms ease;
  }

  .custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease;
    border: 3px solid var(--bg-surface);
  }

  .custom-slider::-webkit-slider-thumb:active {
    transform: scale(1.15);
    box-shadow: 0 2px 12px color-mix(in srgb, var(--color-primary) 40%, transparent);
  }

  .custom-slider::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
    cursor: pointer;
    border: 3px solid var(--bg-surface);
  }

  .custom-slider::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--input-bg);
  }

  /* ── Security Shield / App Lock ── */
  .security-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 4px 0;
  }

  .security-shield {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--text-tertiary, #94a3b8) 10%, transparent);
    color: var(--text-tertiary, #94a3b8);
    border: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
    flex-shrink: 0;
    transition: all 400ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .security-shield-locked {
    background: color-mix(in srgb, var(--color-primary, #059669) 12%, transparent);
    color: var(--color-primary, #059669);
    border-color: color-mix(in srgb, var(--color-primary, #059669) 20%, transparent);
    box-shadow: 0 0 20px color-mix(in srgb, var(--color-primary, #059669) 15%, transparent);
  }

  .security-status-text {
    flex: 1;
    min-width: 0;
  }

  .security-status-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary, #0f172a);
    margin: 0 0 2px;
    letter-spacing: -0.01em;
  }

  .security-status-sub {
    font-size: 12px;
    color: var(--text-tertiary, #64748b);
    margin: 0;
    line-height: 1.4;
  }

  .security-panel-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 0 6px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-secondary, #475569);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    transition: color 150ms ease;
  }

  .security-panel-toggle:hover {
    color: var(--text-primary, #0f172a);
  }

  .security-panel {
    padding: 12px 0 4px;
    border-top: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
    margin-top: 4px;
  }

  .security-row {
    padding: 10px 0;
  }

  .security-row-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .security-row-icon {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, #8b5cf6 10%, transparent);
    flex-shrink: 0;
  }

  .security-row-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary, #0f172a);
    margin: 0;
  }

  .security-row-desc {
    font-size: 11px;
    color: var(--text-tertiary, #64748b);
    margin-top: 2px;
    font-weight: 400;
  }

  .security-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .security-chip {
    height: 32px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1.5px solid var(--border-subtle, rgba(0,0,0,0.08));
    background: var(--bg-elevated, var(--input-bg, #f0fdf4));
    color: var(--text-secondary, #475569);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: all 200ms cubic-bezier(0.22, 1, 0.36, 1);
    outline: none;
  }

  .security-chip:hover {
    border-color: var(--text-tertiary, #94a3b8);
  }

  .security-chip:active {
    transform: scale(0.95);
  }

  .security-chip-active {
    background: color-mix(in srgb, #6366f1 12%, var(--bg-elevated, #f0fdf4));
    border-color: #6366f1;
    color: #6366f1;
    font-weight: 600;
  }

  .security-chip-sm {
    height: 28px;
    padding: 0 10px;
    font-size: 11px;
    border-radius: 8px;
  }

  .security-row-divider {
    height: 1px;
    background: var(--border-subtle, rgba(0,0,0,0.06));
    margin: 2px 0;
  }

  .security-action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: opacity 150ms ease;
    outline: none;
  }

  .security-action-row:hover {
    opacity: 0.8;
  }

  .security-action-row:active {
    opacity: 0.6;
  }

  /* ── Lock Setup Dialog Enhancements ── */
  .lock-dialog-card {
    position: relative;
  }

  .lock-dialog-shake {
    animation: lockDialogShake 400ms ease;
  }

  @keyframes lockDialogShake {
    0%, 100% { transform: translateX(0); }
    10% { transform: translateX(-10px); }
    20% { transform: translateX(8px); }
    30% { transform: translateX(-6px); }
    40% { transform: translateX(4px); }
    50% { transform: translateX(-2px); }
    60% { transform: translateX(1px); }
  }

  .lock-step-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 16px;
  }

  .lock-step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--border-subtle, rgba(0,0,0,0.1));
    transition: all 300ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .lock-step-dot-active {
    background: #6366f1;
    box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
    transform: scale(1.3);
  }

  .lock-step-dot-done {
    background: var(--color-primary, #059669);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-primary) 40%, transparent);
  }

  .lock-error-text {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-danger, #ef4444);
    margin: 8px 0 0;
    text-align: center;
    animation: lockErrorFade 200ms ease;
  }

  @keyframes lockErrorFade {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .lock-setup-input-wrap {
    margin: 16px 0 4px;
  }

  .lock-setup-input {
    width: 100%;
    height: 52px;
    border-radius: 14px;
    border: 1.5px solid var(--border-subtle, rgba(0,0,0,0.08));
    background: var(--bg-elevated, var(--input-bg, #f0fdf4));
    color: var(--text-primary, #0f172a);
    font-size: 20px;
    font-weight: 600;
    text-align: center;
    letter-spacing: 0.15em;
    outline: none;
    transition: border-color 200ms ease, box-shadow 200ms ease;
    box-sizing: border-box;
  }

  .lock-setup-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  }

  .lock-setup-input::placeholder {
    color: var(--text-tertiary, #64748b);
    font-weight: 400;
    letter-spacing: 0.08em;
    font-size: 16px;
  }

  /* ── Legacy support ── */
  .settings-action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: opacity 150ms ease;
  }

  .settings-action-row:hover {
    opacity: 0.8;
  }

  .settings-action-row:active {
    opacity: 0.6;
  }

  .btn-option-sm {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 8px;
  }

  /* ── Animations ── */
  @keyframes checkDraw {
    from { stroke-dashoffset: 30; }
    to { stroke-dashoffset: 0; }
  }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>