<script lang="ts">
  interface Props {
    usernames: string[];
    avatarUrl?: string | null;
    accentColor?: string | null;
    username?: string | null;
  }

  let { usernames, avatarUrl = null, accentColor = null, username = null }: Props = $props();

  // --- Visibility state ---
  // Show IMMEDIATELY when typing starts (no show-debounce) so the indicator
  // is never missed for brief typing bursts. Keep a hide-debounce so a
  // momentary stop/resume doesn't flicker.
  let visible = $state(usernames.length > 0);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const HIDE_DELAY = 600;

  $effect(() => {
    // Track the reactive dependency
    const hasUsers = usernames.length > 0;

    if (hasUsers) {
      // Clear pending hide — typing is active
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      // Show immediately (no debounce) — never miss a typing event
      visible = true;
    } else {
      // Debounce hide — avoids flicker on brief stop/resume
      if (visible && !hideTimer) {
        hideTimer = setTimeout(() => {
          visible = false;
          hideTimer = null;
        }, HIDE_DELAY);
      }
    }

    return () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    };
  });

  // --- Computed label ---
  const label = $derived.by(() => {
    const n = usernames.length;
    if (n === 0) return '';
    if (n === 1) return `${usernames[0]} is typing`;
    if (n === 2) return `${usernames[0]} and ${usernames[1]} are typing`;
    return `${usernames[0]} and ${n - 1} others are typing`;
  });

  // Accent color for the dots
  const dotColor = $derived(accentColor ?? 'var(--color-primary)');
</script>

{#if usernames.length > 0}
  <div
    class="typing-root"
    class:is-visible={visible}
    role="status"
    aria-label={label}
    aria-live="polite"
  >
    <!-- Optional avatar dot -->
    {#if avatarUrl}
      <span class="typing-avatar">
        <img src={avatarUrl} alt="" class="typing-avatar-img" />
      </span>
    {:else if username}
      <span class="typing-avatar typing-avatar-dot" style="background-color: {dotColor};">
        {username.charAt(0).toUpperCase()}
      </span>
    {/if}

    <!-- Bubble -->
    <div class="typing-bubble">
      <span class="dot" style="--dot-color: {dotColor};"></span>
      <span class="dot" style="--dot-color: {dotColor};"></span>
      <span class="dot" style="--dot-color: {dotColor};"></span>
    </div>

    <!-- Label -->
    {#if label}
      <span class="typing-label">{label}</span>
    {/if}
  </div>
{/if}

<style>
  /* ── Container ── */
  .typing-root {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 0 4px;
    will-change: transform, opacity;
    transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
                transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .typing-root:not(.is-visible) {
    opacity: 0;
    transform: translateY(4px) scale(0.95);
    pointer-events: none;
  }

  .typing-root.is-visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* ── Matte bubble ── */
  .typing-bubble {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 10px 16px;
    border-radius: var(--radius-md, 12px) var(--radius-md, 12px)
      var(--radius-md, 12px) 5px;
    background: var(--bg-elevated, rgba(255, 255, 255, 0.72));
    border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  /* ── Dots ── */
  .dot {
    display: block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--dot-color, var(--color-primary));
    opacity: 0.3;
    transform: scale(0.7);
    will-change: transform, opacity;
    animation: dotBreathe 1.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .dot:nth-child(1) { animation-delay: 0s; }
  .dot:nth-child(2) { animation-delay: 0.25s; }
  .dot:nth-child(3) { animation-delay: 0.5s; }

  /* ── Avatar ── */
  .typing-avatar {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    overflow: hidden;
  }

  .typing-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .typing-avatar-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
  }

  /* ── Label ── */
  .typing-label {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #64748b);
    font-weight: 400;
    letter-spacing: -0.01em;
    white-space: nowrap;
    user-select: none;
  }

  /* ────────────────────────────
     Keyframes — GPU only
     ──────────────────────────── */

  @keyframes dotBreathe {
    0%, 100% {
      opacity: 0.25;
      transform: scale(0.7);
    }
    25% {
      opacity: 1;
      transform: scale(1.2);
    }
    50% {
      opacity: 0.85;
      transform: scale(1.05);
    }
  }
</style>
