<script lang="ts">
  import { X, Clock, CheckCheck, Pencil, MessageSquare, User, Hash } from 'lucide-svelte';
  import type { Message } from '$lib/types/index';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { authStore } from '$lib/stores/auth.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    msg: Message | null;
    isOwn: boolean;
  }

  let { open, onClose, msg, isOwn }: Props = $props();

  // Tick for live "time ago" updates
  let tick = $state(0);
  $effect(() => {
    if (!open) return;
    const t = setInterval(() => { tick++; }, 30_000);
    return () => clearInterval(t);
  });

  function formatFullDate(ts: number): string {
    void tick;
    const d = new Date(ts);
    return d.toLocaleString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatTimeAgo(ts: number): string {
    void tick;
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // Determine read status for this specific message
  let readStatus = $derived.by(() => {
    void tick;
    if (!msg || !isOwn || !chatStore.activeChatId) return null;
    const otherReadId = chatStore.otherUserReadIds.get(chatStore.activeChatId);
    if (!otherReadId) return 'sent' as const;

    // Find the index of this message and the read message
    const msgs = chatStore.messages;
    let msgIdx = -1;
    let readIdx = -1;
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i]!.id === msg.id) msgIdx = i;
      if (msgs[i]!.id === otherReadId) readIdx = i;
    }
    if (msgIdx < 0) return 'sent' as const;
    if (readIdx < 0 || readIdx < msgIdx) return 'delivered' as const;
    return 'read' as const;
  });

  // Get read timestamp (approximate — the timestamp of the message at the read position)
  let readTime = $derived.by(() => {
    void tick;
    if (readStatus !== 'read' || !chatStore.activeChatId) return null;
    const otherReadId = chatStore.otherUserReadIds.get(chatStore.activeChatId);
    if (!otherReadId) return null;
    const readMsg = chatStore.messages.find(m => m.id === otherReadId);
    return readMsg?.ts ?? null;
  });

  function getStatusLabel(): string {
    if (!isOwn) return 'Delivered';
    switch (readStatus) {
      case 'read': return 'Read';
      case 'delivered': return 'Delivered';
      default: return 'Sent';
    }
  }

  function getStatusColor(): string {
    if (!isOwn) return 'var(--text-tertiary)';
    switch (readStatus) {
      case 'read': return 'var(--color-primary)';
      case 'delivered': return '#3b82f6';
      default: return 'var(--text-tertiary)';
    }
  }

  let senderName = $derived.by(() => {
    if (!msg) return '';
    if (isOwn) return authStore.user?.displayName || authStore.user?.username || 'You';
    // Find the other user's name
    const meta = chatStore.activeChatId ? chatStore.chats.get(chatStore.activeChatId) : undefined;
    const other = meta ? chatStore.getOtherParticipant(meta) : undefined;
    return other?.displayName || other?.username || 'Unknown';
  });

  let msgTypeLabel = $derived.by(() => {
    if (!msg) return '';
    switch (msg.t) {
      case 'text': return 'Text';
      case 'image': return 'Image';
      case 'voice': return 'Voice Message';
      case 'video': return 'Video';
      case 'system': return 'System';
      default: return msg.t;
    }
  });

  function handleBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('info-backdrop')) {
      onClose();
    }
  }
</script>

{#if open && msg}
  <!-- Backdrop -->
  <div class="info-backdrop" onclick={handleBackdrop} role="presentation"></div>

  <!-- Sheet -->
  <div class="info-sheet" role="dialog" aria-label="Message info">
    <!-- Drag handle -->
    <div class="info-handle-wrap">
      <div class="info-handle"></div>
    </div>

    <div class="info-header">
      <h3 class="info-title">Message Info</h3>
      <button class="info-close" onclick={onClose} aria-label="Close">
        <X size={18} />
      </button>
    </div>

    <div class="info-body">
      <!-- Sent -->
      <div class="info-row">
        <div class="info-row-icon" style="background: color-mix(in srgb, var(--color-primary) 10%, transparent);">
          <Clock size={14} style="color: var(--color-primary);" />
        </div>
        <div class="info-row-content">
          <span class="info-row-label">Sent</span>
          <span class="info-row-value">{formatFullDate(msg.ts)}</span>
          <span class="info-row-sub">{formatTimeAgo(msg.ts)}</span>
        </div>
      </div>

      <!-- Edited -->
      {#if msg.edited}
        <div class="info-row">
          <div class="info-row-icon" style="background: color-mix(in srgb, #f59e0b 10%, transparent);">
            <Pencil size={14} style="color: #f59e0b;" />
          </div>
          <div class="info-row-content">
            <span class="info-row-label">Edited</span>
            <span class="info-row-value">Yes</span>
            <span class="info-row-sub">This message has been modified</span>
          </div>
        </div>
      {/if}

      <!-- Status (read/delivered/sent) -->
      <div class="info-row">
        <div class="info-row-icon" style="background: color-mix(in srgb, {getStatusColor()} 10%, transparent);">
          <CheckCheck size={14} style="color: {getStatusColor()};" />
        </div>
        <div class="info-row-content">
          <span class="info-row-label">Status</span>
          <span class="info-row-value" style="color: {getStatusColor()};">{getStatusLabel()}</span>
          {#if readStatus === 'read' && readTime}
            <span class="info-row-sub">Read {formatTimeAgo(readTime)}</span>
          {/if}
        </div>
      </div>

      <!-- Sender -->
      <div class="info-row">
        <div class="info-row-icon" style="background: color-mix(in srgb, #8b5cf6 10%, transparent);">
          <User size={14} style="color: #8b5cf6;" />
        </div>
        <div class="info-row-content">
          <span class="info-row-label">Sender</span>
          <span class="info-row-value">{senderName}</span>
          <span class="info-row-sub">{isOwn ? 'You sent this message' : 'Message from this user'}</span>
        </div>
      </div>

      <!-- Type -->
      <div class="info-row">
        <div class="info-row-icon" style="background: color-mix(in srgb, #06b6d4 10%, transparent);">
          <MessageSquare size={14} style="color: #06b6d4;" />
        </div>
        <div class="info-row-content">
          <span class="info-row-label">Type</span>
          <span class="info-row-value">{msgTypeLabel}</span>
          {#if msg.t !== 'text'}
            <span class="info-row-sub">ID: {msg.id.slice(0, 12)}…</span>
          {/if}
        </div>
      </div>

      <!-- Message ID -->
      <div class="info-row info-row-dim">
        <div class="info-row-icon" style="background: color-mix(in srgb, var(--text-tertiary) 8%, transparent);">
          <Hash size={14} style="color: var(--text-tertiary);" />
        </div>
        <div class="info-row-content">
          <span class="info-row-label">Message ID</span>
          <span class="info-row-value info-mono">{msg.id}</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .info-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10001;
    background: rgba(0, 0, 0, 0.3);
    animation: fadeIn 150ms ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .info-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10002;
    max-height: 75vh;
    background: var(--bg-card, #ffffff);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 250ms cubic-bezier(0.22, 1, 0.36, 1);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .info-handle-wrap {
    display: flex;
    justify-content: center;
    padding: 10px 0 4px;
    flex-shrink: 0;
  }

  .info-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-subtle, rgba(0, 0, 0, 0.12));
  }

  .info-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 20px 12px;
    flex-shrink: 0;
  }

  .info-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .info-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: var(--bg-secondary, rgba(0, 0, 0, 0.05));
    border-radius: 50%;
    cursor: pointer;
    color: var(--text-secondary);
    transition: background 120ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .info-close:active {
    background: color-mix(in srgb, var(--text-secondary) 12%, transparent);
  }

  .info-body {
    overflow-y: auto;
    padding: 0 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .info-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.04));
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .info-row-dim .info-row-value {
    font-size: 11px;
  }

  .info-row-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .info-row-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .info-row-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
  }

  .info-row-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.3;
    word-break: break-word;
  }

  .info-row-sub {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 1px;
  }

  .info-mono {
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
    font-size: 11px;
    opacity: 0.6;
    user-select: all;
  }
</style>