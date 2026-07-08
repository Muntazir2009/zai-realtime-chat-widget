<script lang="ts">
  import type { Message } from '$lib/types/index';
  import { Reply, Copy, Trash2 } from 'lucide-svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    msg: Message | null;
    isOwn: boolean;
    onReply: (msg: Message) => void;
    onCopy: (text: string) => void;
    onDelete: (msg: Message) => void;
  }

  let { open, onClose, msg, isOwn, onReply, onCopy, onDelete }: Props = $props();

  function handleReply() {
    if (!msg) return;
    onReply(msg);
    onClose();
  }

  function handleCopy() {
    if (!msg) return;
    onCopy(msg.c);
    onClose();
  }

  function handleDelete() {
    if (!msg) return;
    onDelete(msg);
    onClose();
  }
</script>

<BottomSheet {open} {onClose} title="Message options">
  <div class="flex flex-col gap-1">
    <!-- Reply -->
    <button
      class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
      style="min-height: 44px; padding: 8px 12px; color: var(--text-primary);"
      onclick={handleReply}
    >
      <Reply size={20} />
      <span class="text-sm font-medium">Reply</span>
    </button>

    <!-- Copy (only for text messages with content) -->
    {#if msg?.t === 'text'}
      <button
        class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
        style="min-height: 44px; padding: 8px 12px; color: var(--text-primary);"
        onclick={handleCopy}
      >
        <Copy size={20} />
        <span class="text-sm font-medium">Copy</span>
      </button>
    {/if}

    <!-- Delete (only own text messages) -->
    {#if isOwn && msg?.t === 'text'}
      <button
        class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
        style="min-height: 44px; padding: 8px 12px; color: var(--color-danger);"
        onclick={handleDelete}
      >
        <Trash2 size={20} />
        <span class="text-sm font-medium">Delete</span>
      </button>
    {/if}
  </div>
</BottomSheet>