<script lang="ts">
  import { toastStore } from '$lib/stores/toast.svelte';
  import { tick } from 'svelte';
  import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-svelte';
  import type { ToastType } from '$lib/stores/toast.svelte';

  const MAX_VISIBLE = 3;

  let exitingIds: Set<string> = $state(new Set());

  const visibleToasts = $derived(
    toastStore.toasts.length > MAX_VISIBLE
      ? toastStore.toasts.slice(toastStore.toasts.length - MAX_VISIBLE)
      : toastStore.toasts
  );

  const borderColors: Record<ToastType, string> = {
    success: '#22c55e',
    error: '#ef4444',
    info: '#3b82f6',
    warning: '#f59e0b',
  };

  const iconColors: Record<ToastType, string> = {
    success: '#22c55e',
    error: '#ef4444',
    info: '#3b82f6',
    warning: '#f59e0b',
  };

  function getIcon(type: ToastType) {
    switch (type) {
      case 'success': return CheckCircle;
      case 'error': return XCircle;
      case 'info': return Info;
      case 'warning': return AlertTriangle;
    }
  }

  async function handleDismiss(id: string) {
    exitingIds = new Set([...exitingIds, id]);
    await tick();
    await new Promise((r) => setTimeout(r, 200));
    toastStore.dismiss(id);
    exitingIds = new Set([...exitingIds].filter((eid) => eid !== id));
  }
</script>

<div
  class="fixed top-3 right-3 left-3 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none safe-top"
  role="region"
  aria-label="Notifications"
  aria-live="polite"
>
  {#each visibleToasts as toast (toast.id)}
    {@const Icon = getIcon(toast.type)}
    {@const isExiting = exitingIds.has(toast.id)}
    <div
      class="glass pointer-events-auto rounded-xl overflow-hidden {isExiting
        ? 'animate-exit-slide-up'
        : 'animate-fade-in animate-slide-down'}"
      style="border-left: 3px solid {borderColors[toast.type]}; box-shadow: var(--shadow-float);"
      role="alert"
    >
      <div class="flex items-center gap-3 px-4 py-3">
        <div class="shrink-0">
          <Icon
            size={20}
            style="color: {iconColors[toast.type]};"
            aria-hidden="true"
          />
        </div>

        <p
          class="flex-1 text-sm leading-snug"
          style="color: var(--text-primary);"
        >
          {toast.message}
        </p>

        <button
          type="button"
          class="shrink-0 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          style="min-width: var(--touch-min); min-height: var(--touch-min);"
          onclick={() => handleDismiss(toast.id)}
          aria-label="Dismiss notification"
        >
          <X size={16} style="color: var(--text-tertiary);" />
        </button>
      </div>
    </div>
  {/each}
</div>