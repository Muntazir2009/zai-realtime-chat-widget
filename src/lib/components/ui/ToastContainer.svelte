<script lang="ts">
  /**
   * ToastContainer — Dynamic Island-style micro pill.
   *
   * Compact, centered pill that drops down from the top:
   *  - Tiny height, auto-width to content
   *  - Type-colored dot indicator
   *  - Expand-down animation (mimics Dynamic Island expand)
   *  - Tap to dismiss
   *  - Subtle progress fade on bottom edge
   */

  import { toastStore } from '$lib/stores/toast.svelte';
  import type { ToastType } from '$lib/stores/toast.svelte';

  const TYPE_COLORS: Record<ToastType, string> = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#0ea5e9',
  };

  const TYPE_ICONS: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'i',
  };
</script>

{#if toastStore.toasts.length > 0}
  {#each toastStore.toasts as toast (toast.id)}
    {@const exiting = toastStore.exiting.includes(toast.id)}

    <div
      class="di-wrap {exiting ? 'di-exit' : 'di-enter'}"
      role="status"
      aria-live="polite"
      onclick={() => toastStore.dismiss(toast.id)}
    >
      <!-- Colored dot -->
      <span
        class="di-dot"
        style="background: {TYPE_COLORS[toast.type]};"
        aria-hidden="true"
      />

      <!-- Short text -->
      <span class="di-text">{toast.message}</span>

      <!-- Subtle progress line -->
      {#if toast.duration > 0}
        <span
          class="di-prog"
          style="background: {TYPE_COLORS[toast.type]}; transform: scaleX({toast.progress});"
        />
      {/if}
    </div>
  {/each}
{/if}

<style>
  /* ── Wrapper — centered pill, anchored to top ── */
  .di-wrap {
    position: fixed;
    top: max(8px, env(safe-area-inset-top, 0px));
    left: 50%;
    z-index: 9999;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: calc(100vw - 32px);
    height: 28px;
    padding: 0 12px 0 8px;
    border-radius: 99px;
    background: var(--bg-elevated, #ffffff);
    border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.10));
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.10), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
    pointer-events: auto;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    will-change: transform, opacity;
    overflow: hidden;
  }

  /* ── Animations — expand-down from pill → island ── */
  .di-enter {
    animation: diIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .di-exit {
    animation: diOut 200ms cubic-bezier(0.4, 0, 1, 1) both;
  }

  @keyframes diIn {
    from {
      opacity: 0;
      transform: translateX(-50%) scaleY(0.3) scaleX(0.6);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) scaleY(1) scaleX(1);
    }
  }

  @keyframes diOut {
    from {
      opacity: 1;
      transform: translateX(-50%) scaleY(1) scaleX(1);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) scaleY(0.3) scaleX(0.5);
    }
  }

  /* ── Colored dot indicator ── */
  .di-dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  /* ── Text ── */
  .di-text {
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.01em;
    color: var(--text-primary, #0f172a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  /* ── Progress line (bottom edge) ── */
  .di-prog {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1.5px;
    display: block;
    transform-origin: left center;
    will-change: transform;
    opacity: 0.35;
    border-radius: 0 0 99px 99px;
  }

  /* ── Dark themes ── */
  :global(.dark) .di-wrap {
    background: var(--bg-elevated, #1c1c2e);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  }

  :global(.amoled) .di-wrap {
    background: var(--bg-elevated, #111);
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.5);
  }

  :global(.crimson-dark) .di-wrap {
    background: var(--bg-elevated, #1a0a14);
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow: 0 2px 14px rgba(0, 0, 0, 0.4);
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .di-enter,
    .di-exit {
      animation: none !important;
    }
  }
</style>
