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

<div class="reply-bar">
  <div class="reply-accent"></div>
  <div class="reply-content">
    <div class="reply-line"></div>
    <div class="reply-body">
      <p class="reply-who">{senderName}</p>
      <div class="reply-preview-row">
        {#if getMessageTypeIcon(message)}
          {@const Icon = getMessageTypeIcon(message)!}
          <Icon size={11} class="reply-type-icon" />
        {/if}
        <p class="reply-text">{getMessagePreview(message)}</p>
      </div>
    </div>
  </div>
  <button class="reply-cancel" onclick={onCancel} aria-label="Cancel reply">
    <X size={15} />
  </button>
</div>

<style>
  .reply-bar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 8px 4px 8px 0;
    flex-shrink: 0;
    animation: replyIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    background: transparent;
  }

  .reply-accent {
    width: 3px;
    align-self: stretch;
    border-radius: 0 2px 2px 0;
    background: var(--color-primary);
    flex-shrink: 0;
    margin: 6px 0 6px 12px;
  }

  .reply-content {
    flex: 1;
    display: flex;
    align-items: stretch;
    gap: 8px;
    min-width: 0;
    padding: 0 8px;
  }

  .reply-line {
    width: 0;
    border-left: 1.5px dashed var(--border-subtle);
    flex-shrink: 0;
  }

  .reply-body { min-width: 0; flex: 1; }

  .reply-who {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary);
    margin: 0 0 1px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reply-preview-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .reply-type-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .reply-text {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reply-cancel {
    min-width: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--text-tertiary);
    background: transparent;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .reply-cancel:active { transform: scale(0.85); background: var(--input-bg); }

  @keyframes replyIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>