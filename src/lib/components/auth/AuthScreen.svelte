<script lang="ts">
  import { MessageCircle, User, Lock, UserPlus, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-svelte';

  // Stores will be provided by the store layer
  import { authStore } from '$lib/stores/auth.svelte';

  let mode = $state<'login' | 'register'>('login');

  // Login fields
  let loginUsername = $state('');
  let loginPassword = $state('');
  let loginShowPwd = $state(false);

  // Register fields
  let regUsername = $state('');
  let regDisplayName = $state('');
  let regPassword = $state('');
  let regConfirm = $state('');
  let regShowPwd = $state(false);
  let regShowConfirm = $state(false);

  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // --- Derived: Pill tab states ---
  let isLogin = $derived(mode === 'login');
  let isRegister = $derived(mode === 'register');

  // --- Derived: Username character count ---
  let regUsernameLen = $derived(regUsername.length);
  let regUsernameValid = $derived(regUsernameLen >= 3 && regUsernameLen <= 20);
  let regUsernameTooShort = $derived(regUsernameLen > 0 && regUsernameLen < 3);
  let regUsernameTooLong = $derived(regUsernameLen > 20);

  // --- Derived: Password strength ---
  type Strength = 'none' | 'weak' | 'medium' | 'strong';

  let passwordStrength = $derived((): Strength => {
    const pwd = regPassword;
    if (!pwd) return 'none';
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 2) return 'weak';
    if (score <= 3) return 'medium';
    return 'strong';
  });

  let strengthLabel = $derived({
    none: '',
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
  }[passwordStrength()]);

  let strengthColor = $derived({
    none: 'transparent',
    weak: 'var(--color-danger)',
    medium: 'var(--color-warning)',
    strong: 'var(--color-primary)',
  }[passwordStrength()]);

  let strengthBarWidth = $derived({
    none: '0%',
    weak: '33%',
    medium: '66%',
    strong: '100%',
  }[passwordStrength()]);

  // --- Functions ---
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
    if (regUsernameLen < 3 || regUsernameLen > 20) {
      error = 'Username must be between 3 and 20 characters.';
      return;
    }
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

  function dismissError() {
    error = null;
  }

  function handleForgotPassword() {
    console.log('Forgot password clicked');
  }
</script>

<div class="auth-page">
  <!-- Animated gradient orbs (background decoration) -->
  <div class="gradient-orb gradient-orb--1"></div>
  <div class="gradient-orb gradient-orb--2"></div>

  <div class="glass rounded-[var(--radius-lg)] w-full max-w-sm p-6 animate-scale-in">
    <!-- Logo / Title -->
    <div class="flex flex-col items-center mb-8">
      <div class="logo-icon">
        <MessageCircle size={28} class="text-white" />
      </div>
      <h1 class="text-2xl font-bold" style="color: var(--text-primary);">
        <span style="color: var(--color-primary);">Chat</span>
      </h1>
      <p class="text-sm mt-1" style="color: var(--text-tertiary);">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </p>
    </div>

    <!-- Pill Tabs -->
    <div class="pill-tabs" style="background: var(--input-bg);">
      <button
        class="pill-tab"
        class:active={isLogin}
        onclick={() => switchMode('login')}
        disabled={isLoading}
      >
        <User size={16} />
        Login
      </button>
      <button
        class="pill-tab"
        class:active={isRegister}
        onclick={() => switchMode('register')}
        disabled={isLoading}
      >
        <UserPlus size={16} />
        Register
      </button>
    </div>

    <!-- Error Message (glass card with red accent, dismissible) -->
    {#if error}
      <div class="error-card animate-fade-in">
        <div class="error-accent"></div>
        <p class="error-text">{error}</p>
        <button
          class="error-dismiss"
          onclick={dismissError}
          aria-label="Dismiss error"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
    {/if}

    <!-- Login Form -->
    {#if mode === 'login'}
      <form onsubmit={handleLogin} class="flex flex-col gap-4 animate-fade-in">
        <div class="field-group">
          <User size={18} class="field-icon" />
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
        <div class="field-group">
          <Lock size={18} class="field-icon" />
          <input
            type={loginShowPwd ? 'text' : 'password'}
            placeholder="Password"
            class="glass-input w-full min-h-[44px] pl-10 pr-11 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={loginPassword}
            autocomplete="current-password"
            disabled={isLoading}
          />
          <button
            type="button"
            class="pwd-toggle"
            onclick={() => loginShowPwd = !loginShowPwd}
            tabindex="-1"
            aria-label={loginShowPwd ? 'Hide password' : 'Show password'}
          >
            {#if loginShowPwd}
              <EyeOff size={18} />
            {:else}
              <Eye size={18} />
            {/if}
          </button>
        </div>

        <!-- Forgot password link -->
        <div class="flex justify-end">
          <button
            type="button"
            class="forgot-link"
            onclick={handleForgotPassword}
            style="color: var(--color-primary);"
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          class="submit-btn"
          class:loading={isLoading}
          style="background: var(--color-primary); color: var(--color-primary-foreground);"
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
        <!-- Username with character count -->
        <div class="field-group">
          <User size={18} class="field-icon" />
          <input
            type="text"
            placeholder="Username"
            class="glass-input w-full min-h-[44px] pl-10 pr-14 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={regUsername}
            autocomplete="username"
            disabled={isLoading}
            maxlength="20"
          />
          <span class="char-count" class:invalid={!regUsernameValid && regUsernameLen > 0}>
            {regUsernameLen}/20
          </span>
        </div>

        <div class="field-group">
          <UserPlus size={18} class="field-icon" />
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

        <!-- Password with strength indicator -->
        <div class="field-group">
          <Lock size={18} class="field-icon" />
          <input
            type={regShowPwd ? 'text' : 'password'}
            placeholder="Password"
            class="glass-input w-full min-h-[44px] pl-10 pr-11 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={regPassword}
            autocomplete="new-password"
            disabled={isLoading}
          />
          <button
            type="button"
            class="pwd-toggle"
            onclick={() => regShowPwd = !regShowPwd}
            tabindex="-1"
            aria-label={regShowPwd ? 'Hide password' : 'Show password'}
          >
            {#if regShowPwd}
              <EyeOff size={18} />
            {:else}
              <Eye size={18} />
            {/if}
          </button>
        </div>

        <!-- Password strength bar -->
        {#if regPassword.length > 0}
          <div class="strength-container animate-fade-in">
            <div class="strength-track">
              <div
                class="strength-bar"
                style="width: {strengthBarWidth}; background: {strengthColor};"
              ></div>
            </div>
            <span class="strength-label" style="color: {strengthColor};">
              {strengthLabel}
            </span>
          </div>
        {/if}

        <div class="field-group">
          <Lock size={18} class="field-icon" />
          <input
            type={regShowConfirm ? 'text' : 'password'}
            placeholder="Confirm Password"
            class="glass-input w-full min-h-[44px] pl-10 pr-11 rounded-[var(--radius-md)] outline-none"
            style="color: var(--text-primary);"
            bind:value={regConfirm}
            autocomplete="new-password"
            disabled={isLoading}
          />
          <button
            type="button"
            class="pwd-toggle"
            onclick={() => regShowConfirm = !regShowConfirm}
            tabindex="-1"
            aria-label={regShowConfirm ? 'Hide password' : 'Show password'}
          >
            {#if regShowConfirm}
              <EyeOff size={18} />
            {:else}
              <Eye size={18} />
            {/if}
          </button>
        </div>

        <button
          type="submit"
          class="submit-btn"
          class:loading={isLoading}
          style="background: var(--color-primary); color: var(--color-primary-foreground);"
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
  </div>
</div>

<style>
  /* --- Page container --- */
  .auth-page {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    position: relative;
    overflow: hidden;
    background-color: var(--bg-page);
  }

  /* --- Animated gradient orbs --- */
  .gradient-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.35;
    pointer-events: none;
    z-index: 0;
  }

  .gradient-orb--1 {
    width: 300px;
    height: 300px;
    top: -80px;
    left: -60px;
    background: linear-gradient(135deg, #dc2626, #ef4444, #f87171);
    animation: orbFloat1 8s ease-in-out infinite;
  }

  .gradient-orb--2 {
    width: 250px;
    height: 250px;
    bottom: -60px;
    right: -40px;
    background: linear-gradient(135deg, #f59e0b, #fbbf24, #f97316);
    animation: orbFloat2 10s ease-in-out infinite;
  }

  @keyframes orbFloat1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(30px, 20px) scale(1.08); }
  }

  @keyframes orbFloat2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(-20px, -25px) scale(1.05); }
  }

  /* Ensure card sits above orbs */
  .auth-page > :global(.glass) {
    position: relative;
    z-index: 1;
  }

  /* --- Animated gradient logo icon --- */
  :global(.logo-icon) {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    background: linear-gradient(135deg, #dc2626, #ef4444, #f87171, #dc2626);
    background-size: 300% 300%;
    animation: gradientShift 4s ease-in-out infinite;
    box-shadow: 0 4px 20px rgba(220, 38, 38, 0.3);
  }

  @keyframes gradientShift {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  /* --- Pill Tabs --- */
  .pill-tabs {
    display: flex;
    border-radius: var(--radius-pill);
    padding: 4px;
    margin-bottom: 1.5rem;
  }

  .pill-tab {
    flex: 1;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: var(--radius-pill);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    transition: background 200ms cubic-bezier(0.4, 0, 0.2, 1),
                color 200ms cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .pill-tab.active {
    background: var(--bg-surface);
    color: var(--text-primary);
    box-shadow: var(--shadow-float);
  }

  /* --- Field group with focus ring --- */
  .field-group {
    position: relative;
    border-radius: var(--radius-md);
    transition: box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .field-group:focus-within {
    box-shadow: 0 0 0 2px var(--color-primary), 0 0 0 4px rgba(220, 38, 38, 0.15);
  }

  :global(.field-icon) {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
    pointer-events: none;
    z-index: 1;
    transition: color 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .field-group:focus-within :global(.field-icon) {
    color: var(--color-primary);
  }

  /* --- Password toggle --- */
  .pwd-toggle {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    padding: 4px;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color 150ms ease, background 150ms ease;
  }

  .pwd-toggle:hover {
    color: var(--text-secondary);
    background: var(--border-subtle);
  }

  /* --- Character count --- */
  .char-count {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    pointer-events: none;
    transition: color 200ms ease;
  }

  .char-count.invalid {
    color: var(--color-danger);
  }

  /* --- Password strength --- */
  .strength-container {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 2px;
  }

  .strength-track {
    flex: 1;
    height: 3px;
    background: var(--border-subtle);
    border-radius: var(--radius-pill);
    overflow: hidden;
  }

  .strength-bar {
    height: 100%;
    border-radius: var(--radius-pill);
    transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1),
                background 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .strength-label {
    font-size: var(--text-xs);
    font-weight: 500;
    min-width: 42px;
    text-align: right;
    transition: color 300ms ease;
  }

  /* --- Error card (glass with red accent) --- */
  .error-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 12px 12px 0;
    margin-bottom: 1rem;
    border-radius: var(--radius-md);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
    position: relative;
    overflow: hidden;
  }

  .error-accent {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--color-danger);
    border-radius: 0 2px 2px 0;
  }

  .error-text {
    flex: 1;
    font-size: var(--text-sm);
    color: var(--color-danger);
    line-height: 1.4;
    padding-left: 6px;
  }

  .error-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 28px;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color 150ms ease, background 150ms ease;
    flex-shrink: 0;
  }

  .error-dismiss:hover {
    color: var(--color-danger);
    background: rgba(239, 68, 68, 0.08);
  }

  /* --- Forgot password link --- */
  .forgot-link {
    font-size: var(--text-sm);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    text-decoration: none;
    transition: opacity 150ms ease;
  }

  .forgot-link:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  /* --- Submit button --- */
  .submit-btn {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: 1rem;
    border: none;
    cursor: pointer;
    transition: opacity 200ms ease, transform 100ms ease;
  }

  .submit-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .submit-btn.loading {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submit-btn:not(.loading):hover {
    opacity: 0.9;
  }
</style>