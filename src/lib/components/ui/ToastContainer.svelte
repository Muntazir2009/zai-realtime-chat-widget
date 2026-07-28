<script lang="ts">
  /**
   * ToastContainer — Slim dynamic bar toast.
   *
   * Renders a single toast as a compact bar:
   *  - Minimal, no icons, no glass
   *  - Type-colored left accent border
   *  - Thin progress bar on bottom
   *  - Slide down/up enter/exit
   *  - Tap to dismiss
   */

  import { toastStore } from '$lib/stores/toast.svelte';
  import type { ToastType } from '$lib/stores/toast.svelte';

  const TYPE_COLORS: Record<ToastType, string> = {
    success: 'var(--color-success, #22c55e)',
    error: 'var(--color-danger, #ef4444)',
    warning: 'var(--color-warning, #f59e0b)',
    info: 'var(--color-info, #0ea5e9)',
  };
</script>

{#if toastStore.toasts.length > 0}
  {#each toastStore.toasts as toast (toast.id)}
    {@const exiting = toastStore.exiting.includes(toast.id)}

    <div
      class="toast-bar {exiting ? 'is-exit' : 'is-enter'}"
      style="--accent: {TYPE_COLORS[toast.type]};"
      role="status"
      aria-live="polite"
      onclick={() => toastStore.dismiss(toast.id)}
    >
      <span class="tb-text">{toast.message}</span>
      {#if toast.duration > 0}
        <span
          class="tb-prog"
          style="
            background: {TYPE_COLORS[toast.type]};
            transform: scaleX({toast.progress});
          "
        />
      {/if}
    </div>
  {/each}
{/if}

<style>
  .toast-bar {
    position: fixed;
    top: 0;
    left: 12px;
    right: 12px;
    z-index: 9999;
    padding-top: max(10px, env(safe-area-inset-top, 0px));
    pointer-events: auto;
    will-change: transform, opacity;
  }

  @media (min-width: 480px) {
    .toast-bar {
      left: auto;
      right: 16px;
      width: 340px;
    }
  }

  /* ── Animations ── */
  .toast-bar.is-enter {
    animation: barIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .toast-bar.is-exit {
    animation: barOut 220ms cubic-bezier(0.4, 0, 1, 1) both;
  }

  @keyframes barIn {
    from { opacity: 0; transform: translateY(-100%); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes barOut {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-100%); }
  }

  /* ── Inner pill ── */
  .tb-text {
    display: block;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: var(--text-primary, #0f172a);
    background: var(--bg-elevated, #ffffff);
    border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
    border-left: 3px solid var(--accent);
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.04);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    position: relative;
  }

  /* ── Progress bar (positioned inside text span) ── */
  .tb-prog {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    display: block;
    transform-origin: left center;
    will-change: transform;
    opacity: 0.45;
    border-radius: 0 0 7px 7px;
  }

  /* ── Dark themes ── */
  :global(.dark) .tb-text {
    background: var(--bg-elevated, #1c1c2e);
    border-color: var(--border-subtle, rgba(255, 255, 255, 0.06));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  :global(.amoled) .tb-text {
    background: var(--bg-elevated, #111);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  :global(.crimson-dark) .tb-text {
    background: var(--bg-elevated, #1a0a14);
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .toast-bar.is-enter,
    .toast-bar.is-exit {
      animation: none !important;
    }
  }
</style>
