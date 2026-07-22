<script lang="ts">
  // ============================================================
  // LockScreen — Flagship-quality lock screen overlay
  // Blocks all interaction until unlocked. Supports PIN 4/6 and password.
  // Premium unlock animation: ripple pulse + scale + slide dissolve.
  // ============================================================

  import { appLockStore, type LockType } from '$lib/stores/app-lock.svelte';

  let pin: string = $state('');
  let isVerifying = $state(false);
  let shakeAnim = $state(false);
  let successAnim = $state(false);
  let pressedKey = $state<string | null>(null);
  let unlockPhase: 'idle' | 'ripple' | 'dissolve' = $state('idle');

  const lockType = $derived(appLockStore.settings.lockType);
  const maxLength = $derived(lockType === 'pin4' ? 4 : lockType === 'pin6' ? 6 : 32);
  const isPassword = $derived(lockType === 'password');
  const dotCount = $derived(lockType === 'pin4' ? 4 : lockType === 'pin6' ? 6 : 0);

  // Biometric hint text
  const lockLabel = $derived(
    lockType === 'pin4' ? 'Enter 4-digit PIN' :
    lockType === 'pin6' ? 'Enter 6-digit PIN' :
    'Enter Password'
  );

  // Filled dots (for PIN modes)
  let filledDots = $derived(
    !isPassword ? Array.from({ length: dotCount }, (_, i) => i < pin.length) : []
  );

  // Transition state for each dot
  let dotJustFilled = $state(-1);

  function pressKey(key: string) {
    if (isVerifying || successAnim || unlockPhase !== 'idle') return;
    if (pin.length >= maxLength) return;

    pin += key;
    pressedKey = key;
    setTimeout(() => { pressedKey = null; }, 150);

    // Animate the dot that just filled
    if (!isPassword) {
      dotJustFilled = pin.length - 1;
      setTimeout(() => { dotJustFilled = -1; }, 200);
    }

    // Haptic
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }

    // Auto-submit when full
    if (pin.length >= maxLength) {
      submitPin();
    }
  }

  function backspace() {
    if (isVerifying || successAnim || unlockPhase !== 'idle') return;
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
        // Phase 1: Success micro-feedback (icon → checkmark, green pulse)
        successAnim = true;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([20, 50, 20]);
        }

        // Phase 2: After brief pause, start unlock ripple
        setTimeout(() => {
          unlockPhase = 'ripple';
        }, 350);

        // Phase 3: Dissolve overlay (after ripple reaches edges)
        setTimeout(() => {
          unlockPhase = 'dissolve';
        }, 650);

        // Phase 4: Cleanup
        setTimeout(() => {
          pin = '';
          isVerifying = false;
          successAnim = false;
          unlockPhase = 'idle';
        }, 1000);
      } else {
        shakeAnim = true;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([50, 30, 50, 30, 80]);
        }
        setTimeout(() => {
          shakeAnim = false;
          pin = '';
          isVerifying = false;
        }, 500);
      }
    } catch {
      shakeAnim = true;
      setTimeout(() => {
        shakeAnim = false;
        pin = '';
        isVerifying = false;
      }, 500);
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
  <!-- Unlock ripple effect -->
  {#if unlockPhase === 'ripple' || unlockPhase === 'dissolve'}
    <div class="unlock-ripple"></div>
  {/if}

  <div class="lock-screen-content" class:lock-shake={shakeAnim} class:lock-content-unlock={unlockPhase !== 'idle'}>
    <!-- Lock icon -->
    <div class="lock-icon-wrap">
      <div class="lock-icon" class:lock-icon-success={successAnim}>
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

    <!-- Subtitle: current time -->
    <p class="lock-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
    <p class="lock-date">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>

    <!-- PIN dots (for PIN modes) -->
    {#if !isPassword && dotCount > 0}
      <div class="pin-dots" class:pin-dots-unlock={successAnim}>
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

    <!-- Password input (for password mode) -->
    {#if isPassword}
      <div class="password-field-wrap" class:password-wrap-unlock={successAnim}>
        <input
          type="password"
          class="password-field"
          placeholder="Enter password"
          bind:value={pin}
          maxlength={maxLength}
          disabled={isVerifying || successAnim || unlockPhase !== 'idle'}
          onkeydown={(e) => { if (e.key === 'Enter') submitPin(); }}
        />
        {#if pin.length > 0}
          <button class="password-clear" onclick={() => { pin = ''; }} aria-label="Clear input">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        {/if}
      </div>
    {/if}

    <!-- Keypad (not shown for password mode) -->
    {#if !isPassword}
      <div class="keypad" class:keypad-unlock={successAnim}>
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
            <!-- Spacer / fingerprint area -->
            <div class="key-spacer">
              <button
                class="fingerprint-btn"
                aria-label="Not available"
                disabled
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

    <!-- Emergency / fallback -->
    <p class="lock-hint">Locked by App Lock</p>
  </div>
</div>

<style>
  /* ── Overlay ── */
  .lock-screen-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-page, #f0fdf4);
    animation: lockFadeIn 250ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
    overscroll-behavior: contain;
    overflow: hidden;
  }

  /* ── Unlock Ripple ── */
  .unlock-ripple {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-primary, #059669) 8%, var(--bg-page, #f0fdf4));
    transform: translate(-50%, -50%);
    animation: unlockRippleExpand 400ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    pointer-events: none;
    z-index: 0;
  }

  /* ── Success: Ripple Phase ── */
  .lock-success-ripple {
    animation: none; /* stop fade-in */
  }

  /* ── Success: Dissolve Phase ── */
  .lock-success-dissolve {
    animation: lockDissolve 350ms ease-out forwards;
    pointer-events: none;
  }

  /* ── Content container ── */
  .lock-screen-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 360px;
    padding: 24px;
    transform: translateY(0);
    position: relative;
    z-index: 1;
  }

  .lock-shake {
    animation: lockShake 400ms ease;
  }

  .lock-content-unlock {
    animation: contentUnlock 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  /* ── Lock icon ── */
  .lock-icon-wrap {
    margin-bottom: 20px;
  }

  .lock-icon {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg, rgba(255,255,255,0.72));
    border: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    color: var(--text-primary, #0f172a);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
                background 300ms ease,
                border-color 300ms ease,
                box-shadow 300ms ease;
  }

  .lock-icon-success {
    background: color-mix(in srgb, var(--color-primary, #059669) 15%, var(--glass-bg, white));
    border-color: color-mix(in srgb, var(--color-primary, #059669) 30%, transparent);
    transform: scale(1.05);
    box-shadow: 0 4px 32px color-mix(in srgb, var(--color-primary, #059669) 20%, transparent);
    color: var(--color-primary, #059669);
  }

  /* ── Title ── */
  .lock-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary, #0f172a);
    margin: 0 0 4px;
    letter-spacing: -0.02em;
    transition: color 200ms ease;
  }

  .lock-title-success {
    color: var(--color-primary, #059669);
  }

  /* ── Time / Date ── */
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

  /* ── PIN dots ── */
  .pin-dots {
    display: flex;
    gap: 16px;
    margin-bottom: 28px;
    height: 20px;
    align-items: center;
    transition: opacity 300ms ease, transform 300ms ease;
  }

  .pin-dots-unlock {
    opacity: 0;
    transform: translateY(-8px);
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
  }

  .pin-dot-filled {
    opacity: 1;
    background: var(--text-primary, #0f172a);
  }

  .pin-dot-just {
    transform: scale(1.35);
  }

  /* ── Password field ── */
  .password-field-wrap {
    position: relative;
    width: 100%;
    max-width: 260px;
    margin-bottom: 28px;
    transition: opacity 300ms ease, transform 300ms ease;
  }

  .password-wrap-unlock {
    opacity: 0;
    transform: translateY(-8px);
  }

  .password-field {
    width: 100%;
    height: 52px;
    border-radius: 16px;
    border: 1.5px solid var(--border-subtle, rgba(0,0,0,0.08));
    background: var(--glass-bg, rgba(255,255,255,0.72));
    color: var(--text-primary, #0f172a);
    font-size: 18px;
    font-weight: 500;
    text-align: center;
    letter-spacing: 0.1em;
    padding: 0 44px 0 16px;
    outline: none;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }

  .password-field:focus {
    border-color: var(--text-secondary, #334155);
    box-shadow: 0 0 0 3px rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.06);
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

  /* ── Keypad ── */
  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    width: 100%;
    max-width: 280px;
    margin-bottom: 20px;
    transition: opacity 300ms ease, transform 300ms ease;
  }

  .keypad-unlock {
    opacity: 0;
    transform: translateY(12px);
  }

  .key-btn {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    border: none;
    background: var(--glass-bg, rgba(255,255,255,0.72));
    color: var(--text-primary, #0f172a);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    transition: transform 100ms cubic-bezier(0.34, 1.56, 0.64, 1),
                background 100ms ease,
                box-shadow 100ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .key-btn:hover {
    background: color-mix(in srgb, var(--text-primary, #0f172a) 6%, var(--glass-bg, white));
  }

  .key-btn:active,
  .key-btn-pressed {
    transform: scale(0.92);
    background: color-mix(in srgb, var(--text-primary, #0f172a) 10%, var(--glass-bg, white));
    box-shadow: 0 0 0 3px rgba(0,0,0,0.04);
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
  }

  /* ── Hint ── */
  .lock-hint {
    font-size: 12px;
    color: var(--text-tertiary, #64748b);
    font-weight: 500;
    opacity: 0.6;
  }

  /* ══════════════════════════════
     UNLOCK ANIMATIONS
     ══════════════════════════════ */

  /* Phase 1: Green pulse behind icon (from lock-icon-success) */
  /* Phase 2: Radial ripple from center expanding outward */
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

  /* Phase 3: Content scales up slightly + slides out of view */
  @keyframes contentUnlock {
    0% {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    40% {
      transform: translateY(-10px) scale(1.02);
      opacity: 1;
    }
    100% {
      transform: translateY(-40px) scale(0.96);
      opacity: 0;
    }
  }

  /* Phase 4: Overlay dissolve */
  @keyframes lockDissolve {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      visibility: hidden;
    }
  }

  /* ── Base Animations ── */
  @keyframes lockFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes lockShake {
    0%, 100% { transform: translateX(0); }
    10% { transform: translateX(-12px); }
    20% { transform: translateX(10px); }
    30% { transform: translateX(-8px); }
    40% { transform: translateX(6px); }
    50% { transform: translateX(-4px); }
    60% { transform: translateX(2px); }
  }

  @keyframes checkDraw {
    from { stroke-dashoffset: 30; }
    to { stroke-dashoffset: 0; }
  }
</style>
