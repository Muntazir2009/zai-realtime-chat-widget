<script lang="ts">
  import { MessageCircle, User, Lock, UserPlus, ArrowRight, Loader2 } from 'lucide-svelte';

  // Stores will be provided by the store layer
  import { authStore } from '$lib/stores/auth.svelte';

  let mode = $state<'login' | 'register'>('login');

  // Login fields
  let loginUsername = $state('');
  let loginPassword = $state('');

  // Register fields
  let regUsername = $state('');
  let regDisplayName = $state('');
  let regPassword = $state('');
  let regConfirm = $state('');

  let isLoading = $state(false);
  let error = $state<string | null>(null);

  async function handleLogin(e: Event) {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) return;
    error = null;
    isLoading = true;
    try {
      await authStore.login(loginUsername.trim(), loginPassword);
    } catch (err: any) {
      error = err?.message || 'Login failed. Please try again.';
    } finally {
      isLoading = false;
    }
  }

  async function handleRegister(e: Event) {
    e.preventDefault();
    if (!regUsername.trim() || !regDisplayName.trim() || !regPassword.trim() || !regConfirm.trim()) return;
    if (regPassword !== regConfirm) {
      error = 'Passwords do not match.';
      return;
    }
    error = null;
    isLoading = true;
    try {
      await authStore.register(regUsername.trim(), regPassword, regDisplayName.trim());
    } catch (err: any) {
      error = err?.message || 'Registration failed. Please try again.';
    } finally {
      isLoading = false;
    }
  }

  function switchMode(newMode: 'login' | 'register') {
    if (isLoading) return;
    mode = newMode;
    error = null;
  }
</script>

<div class="min-h-screen flex items-center justify-center px-4 py-8" style="background-color: var(--bg-page);">
  <div class="glass rounded-[var(--radius-lg)] w-full max-w-sm p-6 animate-scale-in">
    <!-- Logo / Title -->
    <div class="flex flex-col items-center mb-8">
      <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
           style="background: linear-gradient(135deg, #059669, #10b981);">
        <MessageCircle size={28} class="text-white" />
      </div>
      <h1 class="text-2xl font-bold" style="color: var(--text-primary);">
        Z.ai <span style="color: var(--color-primary);">Chat</span>
      </h1>
      <p class="text-sm mt-1" style="color: var(--text-tertiary);">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </p>
    </div>

    <!-- Pill Tabs -->
    <div class="flex rounded-[var(--radius-pill)] p-1 mb-6" style="background: var(--input-bg);">
      <button
        class="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-pill)] text-sm font-semibold transition-all duration-200"
        style="background: {mode === 'login' ? 'var(--bg-surface)' : 'transparent'}; color: {mode === 'login' ? 'var(--text-primary)' : 'var(--text-tertiary)'}; box-shadow: {mode === 'login' ? 'var(--shadow-float)' : 'none'};"
        onclick={() => switchMode('login')}
        disabled={isLoading}
      >
        <User size={16} />
        Login
      </button>
      <button
        class="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-pill)] text-sm font-semibold transition-all duration-200"
        style="background: {mode === 'register' ? 'var(--bg-surface)' : 'transparent'}; color: {mode === 'register' ? 'var(--text-primary)' : 'var(--text-tertiary)'}; box-shadow: {mode === 'register' ? 'var(--shadow-float)' : 'none'};"
        onclick={() => switchMode('register')}
        disabled={isLoading}
      >
        <UserPlus size={16} />
        Register
      </button>
    </div>

    <!-- Login Form -->
    {#if mode === 'login'}
      <form onsubmit={handleLogin} class="flex flex-col gap-4 animate-fade-in">
        <div class="relative">
          <User size={18} class="absolute left-3 top-1/2 -translate-y-1/2" style="color: var(--text-tertiary);" />
          <input
            type="text"
            placeholder="Username"
            class="glass-input w-full min-h-[44px] pl-10 pr-4 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={loginUsername}
            autocomplete="username"
            disabled={isLoading}
          />
        </div>
        <div class="relative">
          <Lock size={18} class="absolute left-3 top-1/2 -translate-y-1/2" style="color: var(--text-tertiary);" />
          <input
            type="password"
            placeholder="Password"
            class="glass-input w-full min-h-[44px] pl-10 pr-4 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={loginPassword}
            autocomplete="current-password"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          class="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold text-base transition-opacity duration-200"
          style="background: var(--color-primary); color: var(--color-primary-foreground); opacity: {isLoading ? 0.6 : 1};"
          disabled={isLoading}
        >
          {#if isLoading}
            <Loader2 size={20} class="animate-spin" />
            Signing in...
          {:else}
            Sign In
            <ArrowRight size={18} />
          {/if}
        </button>
      </form>
    {/if}

    <!-- Register Form -->
    {#if mode === 'register'}
      <form onsubmit={handleRegister} class="flex flex-col gap-3 animate-fade-in">
        <div class="relative">
          <User size={18} class="absolute left-3 top-1/2 -translate-y-1/2" style="color: var(--text-tertiary);" />
          <input
            type="text"
            placeholder="Username"
            class="glass-input w-full min-h-[44px] pl-10 pr-4 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={regUsername}
            autocomplete="username"
            disabled={isLoading}
          />
        </div>
        <div class="relative">
          <UserPlus size={18} class="absolute left-3 top-1/2 -translate-y-1/2" style="color: var(--text-tertiary);" />
          <input
            type="text"
            placeholder="Display Name"
            class="glass-input w-full min-h-[44px] pl-10 pr-4 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={regDisplayName}
            autocomplete="name"
            disabled={isLoading}
          />
        </div>
        <div class="relative">
          <Lock size={18} class="absolute left-3 top-1/2 -translate-y-1/2" style="color: var(--text-tertiary);" />
          <input
            type="password"
            placeholder="Password"
            class="glass-input w-full min-h-[44px] pl-10 pr-4 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={regPassword}
            autocomplete="new-password"
            disabled={isLoading}
          />
        </div>
        <div class="relative">
          <Lock size={18} class="absolute left-3 top-1/2 -translate-y-1/2" style="color: var(--text-tertiary);" />
          <input
            type="password"
            placeholder="Confirm Password"
            class="glass-input w-full min-h-[44px] pl-10 pr-4 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={regConfirm}
            autocomplete="new-password"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          class="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold text-base transition-opacity duration-200"
          style="background: var(--color-primary); color: var(--color-primary-foreground); opacity: {isLoading ? 0.6 : 1};"
          disabled={isLoading}
        >
          {#if isLoading}
            <Loader2 size={20} class="animate-spin" />
            Creating account...
          {:else}
            Create Account
            <ArrowRight size={18} />
          {/if}
        </button>
      </form>
    {/if}

    <!-- Error Message -->
    {#if error}
      <p class="text-sm text-center mt-4 animate-fade-in" style="color: var(--color-danger);">
        {error}
      </p>
    {/if}
  </div>
</div>