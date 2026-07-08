<script lang="ts">
  import { X } from 'lucide-svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    title?: string;
    children?: import('svelte').Snippet;
  }

  let { open, onClose, title, children }: Props = $props();

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeydown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = '';
    };
  });
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 animate-fade-in"
    style="background: var(--overlay-bg);"
    onclick={handleBackdrop}
    role="dialog"
    aria-modal="true"
    aria-label={title || 'Bottom sheet'}
  >
    <!-- Sheet -->
    <div
      class="absolute bottom-0 left-0 right-0 glass rounded-t-[var(--radius-lg)] animate-slide-up pb-safe"
      style="max-height: 80vh; overflow-y: auto;"
    >
      <!-- Drag Handle -->
      <div class="flex justify-center pt-3 pb-2">
        <div
          class="w-10 h-1 rounded-[var(--radius-pill)]"
          style="background: var(--text-tertiary); opacity: 0.4;"
        ></div>
      </div>

      <!-- Title -->
      {#if title}
        <div class="flex items-center justify-between px-4 pb-3">
          <h2 class="font-semibold text-lg" style="color: var(--text-primary);">{title}</h2>
          <button
            class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-95"
            style="color: var(--text-secondary);"
            onclick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
      {/if}

      <!-- Content -->
      <div class="px-4 pb-4">
        {#if children}
          {@render children()}
        {/if}
      </div>
    </div>
  </div>
{/if}