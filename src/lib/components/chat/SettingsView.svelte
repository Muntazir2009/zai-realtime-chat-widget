<script lang="ts">
  import { LogOut, Check, Moon, Sun, Smartphone, Shield, Palette, Info, Settings } from 'lucide-svelte';
  import { themeManager } from '$lib/managers/ThemeManager.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import type { ThemeMode } from '$lib/types/index';

  const themes: { mode: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
    { mode: 'light', label: 'Light', desc: 'Clean & bright', icon: Sun },
    { mode: 'dark', label: 'Dark', desc: 'Easy on the eyes', icon: Moon },
    { mode: 'amoled', label: 'AMOLED', desc: 'True black', icon: Smartphone },
  ];

  function setTheme(mode: ThemeMode) {
    themeManager.setTheme(mode);
  }

  function handleLogout() {
    chatStore.detachAllListeners();
    presenceManager?.disconnect();
    authStore.logout();
    uiStore.setView('auth');
  }
</script>

<div class="flex flex-col h-full" style="background-color: var(--bg-page);">
  <!-- Header -->
  <header class="glass-header safe-top flex items-center justify-between px-4" style="height: 60px; min-height: 60px; z-index: 50;">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #dc2626, #ef4444);">
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
          style="background: linear-gradient(135deg, #ef4444, #dc2626);"
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
      </div>
    </section>

    <!-- Appearance Section -->
    <section class="animate-fade-in" style="animation-delay: 50ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Palette size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Appearance</p>
      </div>
      <div class="grid grid-cols-3 gap-2">
        {#each themes as theme (theme.mode)}
          {@const isActive = themeManager.currentTheme === theme.mode}
          <button
            class="glass flex flex-col items-center gap-2 p-3.5 rounded-[var(--radius-md)] transition-all duration-200 active:scale-95"
            style={isActive ? 'background: var(--color-primary); color: var(--color-primary-foreground); border-color: var(--color-primary);' : ''}
            onclick={() => setTheme(theme.mode)}
          >
            <theme.icon size={22} />
            <span class="text-xs font-bold">{theme.label}</span>
            <span class="text-[10px] leading-tight opacity-70">{theme.desc}</span>
            {#if isActive}
              <div class="w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style="background: var(--color-primary-foreground);">
                <Check size={11} style="color: var(--color-primary);" />
              </div>
            {:else}
              <div class="w-5 h-5 mt-0.5"></div>
            {/if}
          </button>
        {/each}
      </div>
    </section>

    <!-- Preferences Section -->
    <section class="animate-fade-in" style="animation-delay: 100ms;">
      <div class="flex items-center gap-2 mb-3 px-1">
        <Shield size={14} style="color: var(--text-tertiary);" />
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">About</p>
      </div>
      <div class="glass rounded-[var(--radius-lg)]" style="border-color: var(--border-subtle);">
        <div class="flex items-center justify-between p-3.5">
          <div class="flex items-center gap-3">
            <Info size={18} style="color: var(--text-secondary);" />
            <span class="text-sm font-medium" style="color: var(--text-primary);">Version</span>
          </div>
          <span class="text-xs" style="color: var(--text-tertiary);">v1.0.0</span>
        </div>
      </div>
    </section>

    <!-- Logout -->
    <section class="animate-fade-in" style="animation-delay: 150ms;">
      <button
        class="w-full glass flex items-center justify-center gap-2.5 min-h-[48px] rounded-[var(--radius-lg)] font-semibold text-sm transition-all duration-200 active:scale-[0.97]"
        style="background: rgba(239, 68, 68, 0.08); color: var(--color-danger); border-color: rgba(239, 68, 68, 0.12);"
        onclick={handleLogout}
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </section>

  </div>
</div>