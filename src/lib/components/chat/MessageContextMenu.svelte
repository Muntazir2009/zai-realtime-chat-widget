<script lang="ts">
  import type { Message } from '$lib/types/index';
  import { Reply, Copy, Trash2, Pin, Star, Pencil, SmilePlus } from 'lucide-svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    msg: Message | null;
    isOwn: boolean;
    isPinned?: boolean;
    isStarred?: boolean;
    onReply: (msg: Message) => void;
    onCopy: (text: string) => void;
    onDelete: (msg: Message) => void;
    onPin?: (msg: Message) => void;
    onStar?: (msg: Message) => void;
    onEdit?: (msg: Message) => void;
    onReact?: (msg: Message) => void;
  }

  let {
    open, onClose, msg, isOwn, isPinned = false, isStarred = false,
    onReply, onCopy, onDelete, onPin, onStar, onEdit, onReact,
  }: Props = $props();

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

  function handlePin() {
    if (!msg) return;
    onPin?.(msg);
    onClose();
  }

  function handleStar() {
    if (!msg) return;
    onStar?.(msg);
    onClose();
  }

  function handleEdit() {
    if (!msg) return;
    onEdit?.(msg);
    onClose();
  }

  function handleReact() {
    if (!msg) return;
    onReact?.(msg);
    onClose();
  }
</script>

<BottomSheet {open} {onClose} title="Message options">
  <div class="flex flex-col gap-0.5">
    <!-- Reply -->
    <button
      class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
      style="min-height: 44px; padding: 8px 12px; color: var(--text-primary);"
      onclick={handleReply}
    >
      <Reply size={20} />
      <span class="text-sm font-medium">Reply</span>
    </button>

    <!-- Copy -->
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

    <!-- Pin / Unpin -->
    <button
      class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
      style="min-height: 44px; padding: 8px 12px; color: {isPinned ? 'var(--color-primary)' : 'var(--text-primary)'};"
      onclick={handlePin}
    >
      <Pin size={20} />
      <span class="text-sm font-medium">{isPinned ? 'Unpin message' : 'Pin message'}</span>
    </button>

    <!-- Star / Unstar -->
    <button
      class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
      style="min-height: 44px; padding: 8px 12px; color: {isStarred ? 'var(--color-primary)' : 'var(--text-primary)'};"
      onclick={handleStar}
    >
      <Star size={20} fill={isStarred ? 'var(--color-primary)' : 'none'} />
      <span class="text-sm font-medium">{isStarred ? 'Unstar' : 'Star message'}</span>
    </button>

    <!-- Edit (own text messages only) -->
    {#if isOwn && msg?.t === 'text'}
      <button
        class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
        style="min-height: 44px; padding: 8px 12px; color: var(--text-primary);"
        onclick={handleEdit}
      >
        <Pencil size={20} />
        <span class="text-sm font-medium">Edit</span>
      </button>
    {/if}

    <!-- React -->
    <button
      class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
      style="min-height: 44px; padding: 8px 12px; color: var(--text-primary);"
      onclick={handleReact}
    >
      <SmilePlus size={20} />
      <span class="text-sm font-medium">React</span>
    </button>

    <!-- Divider -->
    <div class="my-1.5 mx-3" style="border-top: 1px solid var(--border-subtle);"></div>

    <!-- Delete -->
    {#if isOwn}
      <button
        class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
        style="min-height: 44px; padding: 8px 12px; color: var(--color-danger);"
        onclick={handleDelete}
      >
        <Trash2 size={20} />
        <span class="text-sm font-medium">Delete for everyone</span>
      </button>
    {:else}
      <button
        class="flex items-center gap-3 w-full transition-spring active:scale-95 rounded-[var(--radius-md)]"
        style="min-height: 44px; padding: 8px 12px; color: var(--color-danger);"
        onclick={handleDelete}
      >
        <Trash2 size={20} />
        <span class="text-sm font-medium">Delete for me</span>
      </button>
    {/if}
  </div>
</BottomSheet>