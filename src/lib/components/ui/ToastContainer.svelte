<script lang="ts">
  /**
   * ToastContainer — Frosted-glass toast notification renderer.
   *
   * Renders the toastStore.toasts stack with:
   *  - Glassmorphism card design (no left-border accent)
   *  - Inline SVG animated icons per type
   *  - Slide-down enter / slide-up exit (CSS keyframes, GPU-composited)
   *  - 2 px progress bar (type-coloured) that pauses on hover
   *  - Swipe-to-dismiss on touch (100 px threshold)
   *  - Tap-to-dismiss (whole card or X button)
   *  - Optional action button (e.g. "Undo")
   *  - Staggered entry (50 ms per item)
   *  - Safe-area-inset-top awareness
   *  - Responsive: top-center on mobile, top-right on desktop
   */

  import { toastStore } from '$lib/stores/toast.svelte';
  import type { Toast, ToastType } from '$lib/stores/toast.svelte';

  // ── Per-toast swipe state (non-reactive Map for perf) ───────

  const swipeData = new Map<
    string,
    { startX: number; offsetX: number; active: boolean }
  >();

  // Reactive mirror only for the template to read
  let swipeOffsets: Record<string, number> = $state({});
  let springBack: Record<string, boolean> = $state({});

  // ── Colour look-ups ─────────────────────────────────────────

  const TYPE_COLOR: Record<ToastType, string> = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };

  const TYPE_BG: Record<ToastType, string> = {
    success: 'rgba(34,197,94,0.12)',
    error: 'rgba(239,68,68,0.12)',
    warning: 'rgba(245,158,11,0.12)',
    info: 'rgba(59,130,246,0.12)',
  };

  // ── Helpers ─────────────────────────────────────────────────

  function isExiting(id: string): boolean {
    return toastStore.exiting.includes(id);
  }

  // ── Touch handlers (swipe-to-dismiss) ───────────────────────

  function onTouchStart(id: string, e: TouchEvent): void {
    const touch = e.touches[0];
    swipeData.set(id, { startX: touch.clientX, offsetX: 0, active: true });
    // Remove spring-back class during active swipe
    springBack = { ...springBack, [id]: false };
  }

  function onTouchMove(id: string, e: TouchEvent): void {
    const data = swipeData.get(id);
    if (!data || !data.active) return;
    const dx = e.touches[0].clientX - data.startX;
    // Only allow rightward swipe
    data.offsetX = Math.max(0, dx);
    // Update reactive mirror
    swipeOffsets = { ...swipeOffsets, [id]: data.offsetX };
  }

  function onTouchEnd(id: string): void {
    const data = swipeData.get(id);
    if (!data) return;
    data.active = false;

    if (data.offsetX > 100) {
      // Threshold exceeded — dismiss
      swipeData.delete(id);
      swipeOffsets = { ...swipeOffsets, [id]: 0 };
      toastStore.dismiss(id);
    } else {
      // Spring back
      springBack = { ...springBack, [id]: true };
      swipeOffsets = { ...swipeOffsets, [id]: 0 };
      // Clean up after transition
      setTimeout(() => {
        springBack = { ...springBack, [id]: false };
        swipeData.delete(id);
      }, 350);
    }
  }

  // ── Icon helper ─────────────────────────────────────────────
  // Renders the correct inline SVG based on toast.icon or toast.type

  function iconSvg(toast: Toast): string {
    const icon = toast.icon ?? 'info';
    switch (icon) {
      case 'check':
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      case 'x':
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      case 'triangle':
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14
            A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      case 'info':
      default:
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            stroke-linejoin="round"><circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }
  }

  function iconAnimClass(type: ToastType): string {
    switch (type) {
      case 'success': return 'anim-icon-scale-in';
      case 'error': return 'anim-icon-shake';
      case 'warning': return 'anim-icon-pulse';
      case 'info': return 'anim-icon-fade-in';
      default: return '';
    }
  }
</script>

<div class="toast-region" role="region" aria-label="Notifications" aria-live="polite">
  {#each toastStore.toasts as toast (toast.id)}
    {@const exiting = isExiting(toast.id)}
    {@const idx = toastStore.toasts.indexOf(toast)}
    {@const offset = swipeOffsets[toast.id] ?? 0}
    {@const isSpringBack = springBack[toast.id] ?? false}

    <!-- Wrapper handles enter/exit keyframe animations -->
    <div
      class="toast-wrapper {exiting ? 'toast-exit' : 'toast-enter'}"
      style="--enter-delay: {idx * 50}ms;"
    >
      <!-- Card handles swipe translate + glass styling -->
      <div
        class="toast-card {isSpringBack ? 'spring-back' : ''}"
        style="
          transform: translateX({offset}px);
          --type-color: {TYPE_COLOR[toast.type]};
          --type-bg: {TYPE_BG[toast.type]};
        "
        role="alert"
        onmouseenter={() => toastStore.pause(toast.id)}
        onmouseleave={() => toast.pauseOnHover !== false && toastStore.resume(toast.id)}
        ontouchstart={(e) => onTouchStart(toast.id, e)}
        ontouchmove={(e) => onTouchMove(toast.id, e)}
        ontouchend={() => onTouchEnd(toast.id)}
        onclick={() => toastStore.dismiss(toast.id)}
      >
        <!-- Body row: icon · message · action · dismiss -->
        <div class="toast-body">
          <!-- Type icon -->
          <span
            class="toast-icon {iconAnimClass(toast.type)}"
            style="color: {TYPE_COLOR[toast.type]}; background: {TYPE_BG[toast.type]};"
            aria-hidden="true"
          >
            {@html iconSvg(toast)}
          </span>

          <!-- Message -->
          <p class="toast-message">
            {toast.message}
            {#if toast.action}
              <button
                class="toast-action"
                onclick={(e) => { e.stopPropagation(); toast.action!.onClick(); }}
              >
                {toast.action.label}
              </button>
            {/if}
          </p>

          <!-- Dismiss X -->
          <button
            class="toast-x"
            onclick={(e) => { e.stopPropagation(); toastStore.dismiss(toast.id); }}
            aria-label="Dismiss notification"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
              stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Progress bar -->
        {#if toast.duration > 0}
          <div class="toast-progress-track">
            <div
              class="toast-progress-bar"
              style="
                background: {TYPE_COLOR[toast.type]};
                transform: scaleX({toast.progress});
              "
            />
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<!-- ─── Styles ───────────────────────────────────────────────── -->

<style>
  /* ── Region (positioning) ──────────────────────────────── */

  .toast-region {
    position: fixed;
    top: 0;
    left: 12px;
    right: 12px;
    z-index: 9999;
    padding-top: max(12px, env(safe-area-inset-top, 0px));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }

  @media (min-width: 640px) {
    .toast-region {
      left: auto;
      right: 16px;
      top: 0;
      align-items: flex-end;
      width: 380px;
      padding-top: max(16px, env(safe-area-inset-top, 0px));
    }
  }

  /* ── Wrapper (enter / exit animations) ─────────────────── */

  .toast-wrapper {
    width: 100%;
    will-change: transform, opacity;
    pointer-events: auto;
  }

  .toast-enter {
    animation: toast-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    animation-delay: var(--enter-delay, 0ms);
  }

  .toast-exit {
    animation: toast-out 260ms ease-in both;
  }

  @keyframes toast-in {
    0% {
      opacity: 0;
      transform: translateY(-20px) scale(0.92);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes toast-out {
    0% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-12px) scale(0.92);
    }
  }

  /* ── Card (glassmorphism) ──────────────────────────────── */

  .toast-card {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-lg, 16px);
    background: var(--glass-bg, rgba(255, 255, 255, 0.72));
    backdrop-filter: var(--glass-blur, blur(20px) saturate(200%));
    -webkit-backdrop-filter: var(--glass-blur, blur(20px) saturate(200%));
    border: var(--glass-border, 1px solid rgba(5, 150, 105, 0.08));
    box-shadow:
      var(--glass-shadow, 0 4px 24px rgba(0, 0, 0, 0.06)),
      0 1px 3px rgba(0, 0, 0, 0.04);
    will-change: transform;
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
    touch-action: pan-y;
  }

  .toast-card.spring-back {
    transition: transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* ── Body ──────────────────────────────────────────────── */

  .toast-body {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 8px 12px 14px;
    min-height: 48px;
  }

  /* ── Icon ──────────────────────────────────────────────── */

  .toast-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }

  /* Icon animations */

  .anim-icon-scale-in {
    animation: icon-scale-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    animation-delay: var(--enter-delay, 0ms);
  }

  @keyframes icon-scale-in {
    0% { transform: scale(0); opacity: 0; }
    60% { transform: scale(1.2); }
    100% { transform: scale(1); opacity: 1; }
  }

  .anim-icon-shake {
    animation: icon-shake 500ms ease both;
    animation-delay: var(--enter-delay, 0ms);
  }

  @keyframes icon-shake {
    0%   { transform: translateX(0); opacity: 0; }
    15%  { opacity: 1; }
    20%  { transform: translateX(-3px); }
    40%  { transform: translateX(3px); }
    60%  { transform: translateX(-2px); }
    80%  { transform: translateX(2px); }
    100% { transform: translateX(0); }
  }

  .anim-icon-pulse {
    animation: icon-pulse 800ms ease-in-out both;
    animation-delay: var(--enter-delay, 0ms);
  }

  @keyframes icon-pulse {
    0%   { transform: scale(0.6); opacity: 0; }
    50%  { transform: scale(1.15); opacity: 1; }
    70%  { transform: scale(0.95); }
    100% { transform: scale(1); opacity: 1; }
  }

  .anim-icon-fade-in {
    animation: icon-fade-in 400ms ease both;
    animation-delay: var(--enter-delay, 0ms);
  }

  @keyframes icon-fade-in {
    0%   { transform: scale(0.85); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  /* ── Message ───────────────────────────────────────────── */

  .toast-message {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm, 0.875rem);
    line-height: 1.4;
    color: var(--text-primary, #0f172a);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  /* ── Action button ─────────────────────────────────────── */

  .toast-action {
    flex-shrink: 0;
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--color-primary, #059669);
    background: none;
    border: none;
    padding: 4px 8px;
    margin: -4px -8px -4px 4px;
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
    white-space: nowrap;
    transition: background 150ms ease;
  }

  .toast-action:hover {
    background: rgba(5, 150, 105, 0.1);
  }

  /* ── Dismiss X ─────────────────────────────────────────── */

  .toast-x {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-tertiary, #64748b);
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
  }

  .toast-x:hover {
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-secondary, #334155);
  }

  @supports (color: oklch(0 0 0)) {
    .dark .toast-x:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }

  /* ── Progress bar ──────────────────────────────────────── */

  .toast-progress-track {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    overflow: hidden;
  }

  .toast-progress-bar {
    width: 100%;
    height: 100%;
    transform-origin: left center;
    will-change: transform;
    opacity: 0.6;
    border-radius: 0 1px 1px 0;
  }

  /* ── Dark mode tweaks ──────────────────────────────────── */

  :global(.dark) .toast-x:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary, #8b949e);
  }

  :global(.crimson-dark) .toast-x:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary, #9595a5);
  }

  :global(.amoled) .toast-x:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-secondary, #a0a0b0);
  }

  /* ── Reduced motion ────────────────────────────────────── */

  @media (prefers-reduced-motion: reduce) {
    .toast-enter,
    .toast-exit,
    .anim-icon-scale-in,
    .anim-icon-shake,
    .anim-icon-pulse,
    .anim-icon-fade-in {
      animation: none !important;
    }
    .toast-card.spring-back {
      transition: none !important;
    }
  }
</style>