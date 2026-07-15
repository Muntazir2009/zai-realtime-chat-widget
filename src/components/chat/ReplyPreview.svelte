<script lang="ts">
  import type { Message } from '$lib/types/index';
  import { X } from 'lucide-svelte';

  interface Props {
    message: Message;
    senderName: string;
    onCancel: () => void;
  }

  let { message, senderName, onCancel }: Props = $props();
</script>

<div class="flex items-center gap-2 px-4 py-2 animate-fade-in" style="background: var(--bg-elevated);">
  <!-- Accent Bar -->
  <div class="w-[3px] self-stretch rounded-full flex-shrink-0" style="background: var(--color-primary);"></div>

  <!-- Content -->
  <div class="flex-1 min-w-0">
    <p class="text-sm font-semibold truncate" style="color: var(--text-primary);">
      {senderName}
    </p>
    <p class="text-sm truncate" style="color: var(--text-secondary);">
      {message.c}
    </p>
  </div>

  <!-- Cancel -->
  <button
    class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] flex-shrink-0 transition-spring active:scale-95"
    style="color: var(--text-tertiary);"
    onclick={onCancel}
    aria-label="Cancel reply"
  >
    <X size={18} />
  </button>
</div>