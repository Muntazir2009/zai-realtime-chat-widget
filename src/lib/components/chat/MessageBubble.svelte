<script lang="ts">
  import type { Message } from '$lib/types/index';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import DeliveryStatus from '$lib/components/indicators/DeliveryStatus.svelte';
  import AudioPlayer from '$lib/components/media/AudioPlayer.svelte';

  interface Props {
    msg: Message;
    isOwn: boolean;
    showAvatar?: boolean;
    senderName?: string;
    onReply?: (msg: Message) => void;
    onLongPress?: (msg: Message) => void;
  }

  let {
    msg,
    isOwn,
    showAvatar = false,
    senderName,
    onReply,
    onLongPress,
  }: Props = $props();

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let touchStartY = $state(0);
  let touchStartX = $state(0);
  const LONG_PRESS_MS = 500;

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    longPressTimer = setTimeout(() => {
      onLongPress?.(msg);
    }, LONG_PRESS_MS);
  }

  function handleTouchMove(e: TouchEvent) {
    const dx = Math.abs(e.touches[0].clientX - touchStartX);
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    if (dx > 10 || dy > 10) {
      if (longPressTimer) clearTimeout(longPressTimer);
    }
  }

  function handleTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    onLongPress?.(msg);
  }

  const timeStr = $derived(() => {
    const d = new Date(msg.ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  // Infer delivery status from message state
  const deliveryStatus = $derived<'sending' | 'sent' | 'delivered' | 'read'>(
    msg.rk && !msg.ts ? 'sending' : 'sent'
  );

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
</script>

<div
  class="flex {isOwn ? 'justify-end' : 'justify-start'} mb-1 px-3 animate-scale-in {isOwn ? 'pl-8' : 'pr-8'}"
  role="article"
  aria-label="Message from {isOwn ? 'you' : senderName || 'unknown'}"
  oncontextmenu={handleContextMenu}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <!-- Avatar for received messages -->
  {#if !isOwn && showAvatar}
    <div class="mr-2 self-end">
      <Avatar username={senderName || '?'} size="sm" />
    </div>
  {/if}

  <div class="flex flex-col {isOwn ? 'items-end' : 'items-start'} max-w-[80%]">
    <!-- Sender Name (for group chats, not needed in 1:1 but keeping extensibility) -->
    {#if !isOwn && senderName && showAvatar}
      <span class="text-xs mb-1 ml-1 font-medium" style="color: var(--color-primary);">
        {senderName}
      </span>
    {/if}

    <!-- Reply Preview Bar -->
    {#if msg.rid}
      <div
        class="mb-1 px-3 py-1.5 rounded-t-[var(--radius-lg)] text-xs max-w-full truncate"
        style="
          background: {isOwn ? 'rgba(0,0,0,0.1)' : 'var(--bg-elevated)'};
          border-left: 2px solid var(--color-primary);
          color: {isOwn ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)'};
        "
      >
        <span class="ml-1 opacity-70">↩ Reply</span>
      </div>
    {/if}

    <!-- Bubble -->
    <div
      class="px-3.5 py-2.5 relative"
      style="
        background: {isOwn ? 'var(--color-sent)' : 'var(--color-received)'};
        color: {isOwn ? 'var(--color-sent-foreground)' : 'var(--color-received-foreground)'};
        border-radius: var(--radius-lg);
        {isOwn ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'}
      "
    >
      {#if msg.t === 'text'}
        <p class="text-[15px] break-words whitespace-pre-wrap leading-relaxed">{msg.c}</p>
      {:else if msg.t === 'voice' && msg.mu}
        <AudioPlayer url={msg.mu} duration={(msg.md?.duration as number) || 0} />
      {:else if msg.t === 'image' && msg.mu}
        <img
          src={msg.mu}
          alt="Shared image"
          class="rounded-[var(--radius-sm)] max-w-full cursor-pointer"
          loading="lazy"
          style="max-height: 240px; object-fit: cover;"
        />
        {#if msg.c}
          <p class="text-[15px] break-words whitespace-pre-wrap mt-1.5">{msg.c}</p>
        {/if}
      {:else if msg.t === 'system'}
        <p class="text-sm italic opacity-70 text-center">{msg.c}</p>
      {/if}
    </div>

    <!-- Timestamp & Status -->
    <div class="flex items-center gap-1 mt-0.5 px-1">
      {#if isOwn}
        <DeliveryStatus status={deliveryStatus} />
      {/if}
      <span class="text-[11px]" style="color: var(--text-tertiary);">
        {timeStr()}
      </span>
    </div>
  </div>
</div>