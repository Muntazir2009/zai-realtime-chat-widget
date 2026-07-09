<script lang="ts">
  import type { Message } from '$lib/types/index';
  import { X, Image as ImageIcon, Mic } from 'lucide-svelte';

  interface Props {
    message: Message;
    senderName: string;
    onCancel: () => void;
  }

  let { message, senderName, onCancel }: Props = $props();

  function getMessagePreview(msg: Message): string {
    if (msg.t === 'image') return '📷 Photo';
    if (msg.t === 'voice') return '🎙 Voice message';
    return msg.c.slice(0, 80);
  }

  function getMessageTypeIcon(msg: Message) {
    if (msg.t === 'image') return ImageIcon;
    if (msg.t === 'voice') return Mic;
    return null;
  }
</script>

<div class="flex items-center gap-2.5 px-4 py-2.5 animate-fade-in" style="background: var(--bg-elevated); border-top: 1px solid var(--border-subtle);">
  <!-- Accent Bar -->
  <div class="w-[3px] self-stretch rounded-full flex-shrink-0" style="background: var(--color-primary);"></div>

  <!-- Content -->
  <div class="flex-1 min-w-0">
    <p class="text-xs font-semibold truncate mb-0.5" style="color: var(--color-primary);">
      {senderName}
    </p>
    <div class="flex items-center gap-1.5 min-w-0">
      {#if getMessageTypeIcon(message)}
        {@const Icon = getMessageTypeIcon(message)!}
        <Icon size={12} style="color: var(--text-tertiary); flex-shrink: 0;" />
      {/if}
      <p class="text-sm truncate" style="color: var(--text-secondary);">
        {getMessagePreview(message)}
      </p>
    </div>
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