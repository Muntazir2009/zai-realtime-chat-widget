<script lang="ts">
  // ============================================================
  // LockScreen — Flagship iPhone-style lock screen
  // Premium liquid glass material with spring animations.
  // Biometric authentication support.
  // ============================================================

  import { appLockStore, type LockType } from '$lib/stores/app-lock.svelte';
  import { isBiometricAvailable } from '$lib/utils/biometric';
  import { onMount } from 'svelte';

  let pin: string = $state('');
  let isVerifying = $state(false);
  let shakeAnim = $state(false);
  let successAnim = $state(false);
  let pressedKey = $state<string | null>(null);
  let unlockPhase: 'idle' | 'ripple' | 'dissolve' = $state('idle');
  let errorGlow = $state(false);
  let errorMsg = $state('');

  // Biometric state
  let bioState: 'idle' | 'attempting' | 'success' | 'failed' | 'cancelled' | 'unavailable' = $state('idle');
  let bioAttempted = $state(false);
  let lockIconPulse = $state(false);

  const lockType = $derived(appLockStore.settings.lockType);
  const maxLength = $derived(lockType === 'pin4' ? 4 : lockType === 'pin6' ? 6 : 32);
  const isPassword = $derived(lockType === 'password');
  const dotCount = $derived(lockType === 'pin4' ? 4 : lockType === 'pin6' ? 6 : 0);

  const lockLabel = $derived(
    lockType === 'pin4' ? 'Enter 4-digit PIN' :
    lockType === 'pin6' ? 'Enter 6-digit PIN' :
    'Enter Password'
  );

  const lockTypeLabel = $derived(
    lockType === 'pin4' ? 'PIN' :
    lockType === 'pin6' ? 'PIN' :
    'password'
  );

  let filledDots = $derived(
    !isPassword ? Array.from({ length: dotCount }, (_, i) => i < pin.length) : []
  );

  let dotJustFilled = $state(-1);

  // ── Biometric auto-prompt ──

  onMount(() => {
    setTimeout(async () => {
      if (bioAttempted) return;
      if (!appLockStore.settings.biometricEnabled) return;
      const available = await isBiometricAvailable();
      if (available) {
        await attemptBiometricUnlock();
      } else {
        bioState = 'unavailable';
      }
    }, 250);
  });

  // ── Biometric flow ──

  async function attemptBiometricUnlock() {
    if (bioState === 'attempting' || successAnim || unlockPhase !== 'idle') return;
    bioState = 'attempting';
    bioAttempted = true;
    const result = await appLockStore.unlockViaBiometric();
    if (result === 'success') {
      bioState = 'success';
      triggerUnlockSuccess();
    } else if (result === 'security_change') {
      bioState = 'unavailable';
      errorMsg = 'Biometric data changed. Use PIN/password.';
      setTimeout(() => { errorMsg = ''; }, 3000);
    } else {
      bioState = 'cancelled';
    }
  }

  // ── Shared unlock success animation ──

  function triggerUnlockSuccess() {
    successAnim = true;
    errorMsg = '';
    errorGlow = false;

    lockIconPulse = true;
    setTimeout(() => { lockIconPulse = false; }, 300);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([20, 50, 20]);
    }

    setTimeout(() => { unlockPhase = 'ripple'; }, 300);
    setTimeout(() => { unlockPhase = 'dissolve'; }, 600);
    setTimeout(() => {
      pin = '';
      isVerifying = false;
      successAnim = false;
      unlockPhase = 'idle';
      bioState = 'idle';
      bioAttempted = false;
      appLockStore.unlockComplete();
    }, 1000);
  }

  function pressKey(key: string) {
    if (isVerifying || successAnim || unlockPhase !== 'idle' || bioState === 'attempting') return;
    if (pin.length >= maxLength) return;

    pin += key;
    pressedKey = key;
    setTimeout(() => { pressedKey = null; }, 150);

    if (!isPassword) {
      dotJustFilled = pin.length - 1;
      setTimeout(() => { dotJustFilled = -1; }, 200);
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }

    if (pin.length >= maxLength) {
      submitPin();
    }
  }

  function backspace() {
    if (isVerifying || successAnim || unlockPhase !== 'idle' || bioState === 'attempting') return;
    if (pin.length === 0) return;
    pin = pin.slice(0, -1);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(5);
    }
  }

  async function submitPin() {
    if (isVerifying || pin.length === 0) return;
    isVerifying = true;

    try {
      const valid = await appLockStore.unlock(pin);
      if (valid) {
        triggerUnlockSuccess();
      } else {
        shakeAnim = true;
        errorGlow = true;
        errorMsg = 'Wrong ' + (lockType === 'password' ? 'password' : 'PIN') + '. Try again.';
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([50, 30, 50, 30, 80]);
        }
        setTimeout(() => {
          shakeAnim = false;
          pin = '';
          isVerifying = false;
          errorGlow = false;
          errorMsg = '';
        }, 600);
      }
    } catch {
      shakeAnim = true;
      errorGlow = true;
      errorMsg = 'Verification failed. Try again.';
      setTimeout(() => {
        shakeAnim = false;
        pin = '';
        isVerifying = false;
        errorGlow = false;
        errorMsg = '';
      }, 600);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (successAnim || unlockPhase !== 'idle') return;

    if (e.key >= '0' && e.key <= '9') {
      pressKey(e.key);
    } else if (e.key === 'Backspace') {
      backspace();
    } else if (e.key === 'Enter' && pin.length > 0) {
      submitPin();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="lock-screen-overlay"
  class:lock-success-ripple={unlockPhase === 'ripple'}
  class:lock-success-dissolve={unlockPhase === 'dissolve'}
>
  {#if unlockPhase === 'ripple' || unlockPhase === 'dissolve'}
    <div class="unlock-ripple"></div>
  {/if}

  <div class="lock-screen-content" class:lock-shake={shakeAnim} class:lock-content-unlock={unlockPhase !== 'idle'}>
    <!-- Lock icon — liquid glass -->
    <div class="lock-icon-wrap">
      <div class="lock-icon" class:lock-icon-success={successAnim} class:bio-attempting={bioState === 'attempting'} class:lock-icon-pulse={lockIconPulse}>
        {#if bioState === 'attempting'}
          <div class="bio-ring"></div>
        {/if}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          {#if successAnim}
            <path d="M20 6L9 17l-5-5" style="stroke-dasharray: 30; stroke-dashoffset: 0; animation: checkDraw 0.4s ease forwards;" />
          {:else}
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          {/if}
        </svg>
      </div>
    </div>

    <!-- Title -->
    <h2 class="lock-title" class:lock-title-success={successAnim}>
      {#if successAnim}
        Unlocked
      {:else}
        {lockLabel}
      {/if}
    </h2>

    <!-- Biometric indicator -->
    {#if bioState === 'attempting'}
      <p class="bio-indicator">Authenticating...</p>
    {/if}

    <!-- Time / Date -->
    <p class="lock-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
    <p class="lock-date">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>

    <!-- PIN dots -->
    {#if !isPassword && dotCount > 0}
      <div class="pin-dots" class:pin-dots-unlock={successAnim} class:pin-dots-error={errorGlow} class:keypad-dimmed={bioState === 'attempting'}>
        {#each filledDots as filled, i}
          <!-- svelte-ignore ts-2351 -->
          <div
            class="pin-dot"
            class:pin-dot-filled={filled}
            class:pin-dot-just={dotJustFilled === i}
            in:scale={{ duration: 150, start: 0.3 }}
            out:scale={{ duration: 150 }}
          ></div>
        {/each}
      </div>
    {/if}

    <!-- Error message -->
    <p class="lock-error" class:lock-error-visible={errorMsg}>{errorMsg}</p>

    <!-- Password input -->
    {#if isPassword}
      <div class="password-field-wrap" class:password-wrap-unlock={successAnim} class:password-wrap-error={errorGlow} class:keypad-dimmed={bioState === 'attempting'}>
        <input
          type="password"
          class="password-field"
          placeholder="Enter password"
          bind:value={pin}
          maxlength={maxLength}
          disabled={isVerifying || successAnim || unlockPhase !== 'idle' || bioState === 'attempting'}
          onkeydown={(e) => { if (e.key === 'Enter') submitPin(); }}
        />
        {#if pin.length > 0}
          <button class="password-clear" onclick={() => { pin = ''; }} aria-label="Clear input">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        {/if}
      </div>
    {/if}

    <!-- Keypad -->
    {#if !isPassword}
      <div class="keypad" class:keypad-unlock={successAnim} class:keypad-dimmed={bioState === 'attempting'}>
        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as key, i}
          {#if key === 'del'}
            <button
              class="key-btn key-btn-action"
              onpointerdown={backspace}
              aria-label="Backspace"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            </button>
          {:else if key === ''}
            <div class="key-spacer">
              <button
                class="fingerprint-btn"
                class:fingerprint-btn-active={appLockStore.settings.biometricEnabled}
                class:fingerprint-btn-pulse={bioState === 'attempting'}
                aria-label="Unlock with biometric"
                disabled={!appLockStore.settings.biometricEnabled || bioState === 'attempting'}
                onclick={() => attemptBiometricUnlock()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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
              </button>
            </div>
          {:else}
            <button
              class="key-btn"
              class:key-btn-pressed={pressedKey === key}
              onpointerdown={(e) => { e.preventDefault(); pressKey(key); }}
            >
              <span class="key-num">{key}</span>
              {#if ['2', '4', '6', '8'].includes(key)}
                <span class="key-letters">
                  {key === '2' ? 'ABC' : key === '4' ? 'GHI' : key === '6' ? 'MNO' : 'TUV'}
                </span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {/if}

    <p class="lock-hint">Locked by App Lock</p>
  </div>
</div>

<style>
  /* ══════════════════════════════
     OVERLAY — iPhone-style open
     ══════════════════════════════ */
  .lock-screen-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-page, #f0fdf4) 97%, rgba(255,255,255,0.3)) 0%,
      color-mix(in srgb, var(--bg-page, #f0fdf4) 100%, rgba(0,0,0,0.04)) 100%
    );
    animation: lockOpen 400ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    will-change: opacity, transform;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
    overscroll-behavior: contain;
    overflow: hidden;
  }

  .lock-success-ripple {
    animation: none;
  }

  .lock-success-dissolve {
    animation: lockDissolve 400ms ease-out forwards;
    pointer-events: none;
  }

  /* ══════════════════════════════
     UNLOCK RIPPLE
     ══════════════════════════════ */
  .unlock-ripple {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-primary, #059669) 8%, var(--bg-page, #f0fdf4));
    transform: translate3d(-50%, -50%, 0);
    animation: unlockRippleExpand 400ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    pointer-events: none;
    z-index: 0;
    will-change: transform, opacity;
  }

  /* ══════════════════════════════
     CONTENT
     ══════════════════════════════ */
  .lock-screen-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 360px;
    padding: 24px;
    transform: translate3d(0, 0, 0);
    position: relative;
    z-index: 1;
    will-change: transform, opacity;
  }

  .lock-shake {
    animation: lockShake 400ms ease;
  }

  .lock-content-unlock {
    animation: contentUnlock 500ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  /* ══════════════════════════════
     LOCK ICON — LIQUID GLASS
     ══════════════════════════════ */
  .lock-icon-wrap {
    margin-bottom: 20px;
  }

  .lock-icon {
    width: 72px;
    height: 72px;
    border-radius: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(40px) saturate(220%);
    -webkit-backdrop-filter: blur(40px) saturate(220%);
    border: 0.5px solid rgba(255, 255, 255, 0.4);
    box-shadow:
      0 8px 32px rgba(0,0,0,0.06),
      0 0.5px 0 rgba(255,255,255,0.3) inset,
      0 0 0 0.5px rgba(0,0,0,0.04);
    color: var(--text-primary, #0f172a);
    transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1),
                background 300ms ease,
                border-color 300ms ease,
                box-shadow 300ms ease;
    will-change: transform;
    position: relative;
  }

  :global(.dark) .lock-icon,
  :global(.amoled) .lock-icon,
  :global(.crimson-dark) .lock-icon {
    background: rgba(22, 27, 34, 0.55);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow:
      0 8px 32px rgba(0,0,0,0.2),
      0 0.5px 0 rgba(255,255,255,0.05) inset;
  }

  .lock-icon-success {
    background: color-mix(in srgb, var(--color-primary, #059669) 15%, rgba(255, 255, 255, 0.55));
    border-color: color-mix(in srgb, var(--color-primary, #059669) 30%, transparent);
    transform: scale(1.05);
    box-shadow:
      0 8px 40px color-mix(in srgb, var(--color-primary, #059669) 20%, transparent),
      0 0.5px 0 rgba(255,255,255,0.2) inset;
    color: var(--color-primary, #059669);
  }

  .lock-icon-pulse {
    animation: iconPulse 300ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Biometric pulsing ring */
  .bio-attempting {
    border-color: color-mix(in srgb, var(--color-primary, #059669) 40%, transparent);
    box-shadow:
      0 8px 32px color-mix(in srgb, var(--color-primary, #059669) 12%, transparent),
      0 0.5px 0 rgba(255,255,255,0.3) inset;
  }

  .bio-ring {
    position: absolute;
    inset: -6px;
    border-radius: 26px;
    border: 2px solid color-mix(in srgb, var(--color-primary, #059669) 35%, transparent);
    animation: bioRingPulse 1.5s ease-in-out infinite;
    pointer-events: none;
  }

  /* ══════════════════════════════
     TITLE / TIME
     ══════════════════════════════ */
  .lock-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary, #0f172a);
    margin: 0 0 4px;
    letter-spacing: -0.02em;
    transition: color 250ms ease;
  }

  .lock-title-success {
    color: var(--color-primary, #059669);
  }

  .lock-time {
    font-size: 48px;
    font-weight: 700;
    color: var(--text-primary, #0f172a);
    margin: 12px 0 0;
    letter-spacing: -0.03em;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .lock-date {
    font-size: 14px;
    color: var(--text-tertiary, #64748b);
    margin: 4px 0 24px;
    font-weight: 500;
  }

  /* Biometric indicator text */
  .bio-indicator {
    font-size: 13px;
    color: var(--color-primary, #059669);
    font-weight: 500;
    margin: 2px 0 0;
    animation: bioIndicatorFade 300ms ease forwards;
    letter-spacing: 0.01em;
  }

  /* ══════════════════════════════
     PIN DOTS
     ══════════════════════════════ */
  .pin-dots {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    height: 20px;
    align-items: center;
    transition: opacity 300ms ease, transform 300ms ease;
    will-change: opacity, transform;
  }

  .pin-dots-unlock {
    opacity: 0;
    transform: translate3d(0, -8px, 0);
  }

  .pin-dots-error .pin-dot-filled {
    background: var(--color-danger, #ef4444) !important;
    transition: background 200ms ease;
  }

  .pin-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-tertiary, #64748b);
    opacity: 0.18;
    transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1),
                opacity 150ms ease,
                background 150ms ease;
    will-change: transform, opacity;
  }

  .pin-dot-filled {
    opacity: 1;
    background: var(--text-primary, #0f172a);
  }

  .pin-dot-just {
    transform: scale(1.35);
  }

  /* ══════════════════════════════
     ERROR MESSAGE
     ══════════════════════════════ */
  .lock-error {
    font-size: 13px;
    color: var(--color-danger, #ef4444);
    margin: 0 0 16px;
    min-height: 18px;
    opacity: 0;
    transform: translate3d(0, -4px, 0);
    transition: opacity 250ms ease, transform 250ms ease;
    font-weight: 500;
  }

  .lock-error-visible {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }

  /* ══════════════════════════════
     PASSWORD FIELD — LIQUID GLASS
     ══════════════════════════════ */
  .password-field-wrap {
    position: relative;
    width: 100%;
    max-width: 260px;
    margin-bottom: 20px;
    transition: opacity 300ms ease, transform 300ms ease;
    will-change: opacity, transform;
  }

  .password-wrap-unlock {
    opacity: 0;
    transform: translate3d(0, -8px, 0);
  }

  .password-field {
    width: 100%;
    height: 52px;
    border-radius: 16px;
    border: 0.5px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(40px) saturate(220%);
    -webkit-backdrop-filter: blur(40px) saturate(220%);
    color: var(--text-primary, #0f172a);
    font-size: 18px;
    font-weight: 500;
    text-align: center;
    letter-spacing: 0.1em;
    padding: 0 44px 0 16px;
    outline: none;
    box-shadow:
      0 4px 20px rgba(0,0,0,0.04),
      0 0.5px 0 rgba(255,255,255,0.2) inset;
    transition: border-color 250ms ease, box-shadow 250ms ease;
  }

  .password-field:focus {
    border-color: var(--text-secondary, #334155);
    box-shadow:
      0 0 0 3px rgba(0,0,0,0.04),
      0 4px 20px rgba(0,0,0,0.06),
      0 0.5px 0 rgba(255,255,255,0.2) inset;
  }

  .password-wrap-error .password-field {
    border-color: var(--color-danger, #ef4444) !important;
    box-shadow:
      0 0 0 3px rgba(239, 68, 68, 0.15),
      0 0 16px rgba(239, 68, 68, 0.1),
      0 0.5px 0 rgba(255,255,255,0.2) inset !important;
  }

  :global(.dark) .password-field,
  :global(.amoled) .password-field,
  :global(.crimson-dark) .password-field {
    background: rgba(22, 27, 34, 0.55);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow:
      0 4px 20px rgba(0,0,0,0.1),
      0 0.5px 0 rgba(255,255,255,0.05) inset;
  }

  .password-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-tertiary, #64748b);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  /* ══════════════════════════════
     KEYPAD — LIQUID GLASS BUTTONS
     ══════════════════════════════ */
  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    width: 100%;
    max-width: 280px;
    margin-bottom: 20px;
    transition: opacity 300ms ease, transform 300ms ease;
    will-change: opacity, transform;
  }

  .keypad-unlock {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }

  .key-btn {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 0.5px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.5);
    color: var(--text-primary, #0f172a);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    backdrop-filter: blur(20px) saturate(200%);
    -webkit-backdrop-filter: blur(20px) saturate(200%);
    box-shadow:
      0 2px 12px rgba(0,0,0,0.04),
      0 0.5px 0 rgba(255,255,255,0.2) inset;
    transition: transform 100ms cubic-bezier(0.34, 1.56, 0.64, 1),
                background 100ms ease,
                box-shadow 100ms ease;
    -webkit-tap-highlight-color: transparent;
    will-change: transform;
  }

  .key-btn:hover {
    background: color-mix(in srgb, var(--text-primary, #0f172a) 6%, rgba(255,255,255,0.5));
  }

  .key-btn:active,
  .key-btn-pressed {
    transform: scale(0.92);
    background: color-mix(in srgb, var(--text-primary, #0f172a) 10%, rgba(255,255,255,0.5));
    box-shadow: 0 0 0 3px rgba(0,0,0,0.04);
  }

  :global(.dark) .key-btn,
  :global(.amoled) .key-btn,
  :global(.crimson-dark) .key-btn {
    background: rgba(22, 27, 34, 0.55);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow:
      0 2px 12px rgba(0,0,0,0.1),
      0 0.5px 0 rgba(255,255,255,0.05) inset;
  }

  .key-num {
    font-size: 26px;
    font-weight: 500;
    line-height: 1;
    margin-top: -2px;
    font-variant-numeric: tabular-nums;
  }

  .key-letters {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--text-tertiary, #64748b);
    margin-top: 1px;
    line-height: 1;
  }

  .key-btn-action {
    background: transparent;
    border: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    color: var(--text-secondary, #334155);
  }

  .key-btn-action:hover {
    background: color-mix(in srgb, var(--text-primary, #0f172a) 4%, transparent);
  }

  .key-btn-action:active {
    transform: scale(0.9);
  }

  .key-spacer {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Fingerprint button ── */
  .fingerprint-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-tertiary, #64748b);
    opacity: 0.3;
    cursor: default;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 200ms ease, background 200ms ease, color 200ms ease, transform 200ms ease;
  }

  .fingerprint-btn-active {
    opacity: 1;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    color: var(--color-primary, #059669);
    box-shadow: 0 2px 10px rgba(0,0,0,0.04);
  }

  :global(.dark) .fingerprint-btn-active,
  :global(.amoled) .fingerprint-btn-active,
  :global(.crimson-dark) .fingerprint-btn-active {
    background: rgba(22, 27, 34, 0.5);
  }

  .fingerprint-btn-active:hover {
    transform: scale(1.05);
  }

  .fingerprint-btn-pulse {
    animation: fingerprintPulse 1.2s ease-in-out infinite;
  }

  /* ── Keypad dimmed during biometric ── */
  .keypad-dimmed {
    opacity: 0.45;
    pointer-events: auto;
  }

  /* ── Hint ── */
  .lock-hint {
    font-size: 12px;
    color: var(--text-tertiary, #64748b);
    font-weight: 500;
    opacity: 0.6;
  }

  /* ══════════════════════════════
     ANIMATIONS
     ══════════════════════════════ */

  @keyframes lockOpen {
    0% {
      opacity: 0;
      transform: scale(1.06);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes unlockRippleExpand {
    0% {
      width: 0;
      height: 0;
      opacity: 1;
    }
    100% {
      width: 200vmax;
      height: 200vmax;
      opacity: 0;
    }
  }

  @keyframes contentUnlock {
    0% {
      transform: translate3d(0, 0, 0) scale(1);
      opacity: 1;
    }
    35% {
      transform: translate3d(0, -8px, 0) scale(1.01);
      opacity: 1;
    }
    100% {
      transform: translate3d(0, -30px, 0) scale(0.97);
      opacity: 0;
    }
  }

  @keyframes lockDissolve {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      visibility: hidden;
    }
  }

  @keyframes lockShake {
    0%, 100% { transform: translate3d(0, 0, 0); }
    10% { transform: translate3d(-14px, 0, 0); }
    20% { transform: translate3d(12px, 0, 0); }
    30% { transform: translate3d(-10px, 0, 0); }
    40% { transform: translate3d(8px, 0, 0); }
    50% { transform: translate3d(-6px, 0, 0); }
    60% { transform: translate3d(3px, 0, 0); }
  }

  @keyframes checkDraw {
    from { stroke-dashoffset: 30; }
    to { stroke-dashoffset: 0; }
  }

  @keyframes iconPulse {
    0% { transform: scale(1); }
    40% { transform: scale(1.12); }
    100% { transform: scale(1.05); }
  }

  @keyframes bioRingPulse {
    0%, 100% {
      opacity: 0.4;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.08);
    }
  }

  @keyframes bioIndicatorFade {
    0% { opacity: 0; transform: translateY(-4px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes fingerprintPulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(0.92);
    }
  }
</style>
