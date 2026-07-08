<script lang="ts">
  import { Send, Paperclip, Mic } from 'lucide-svelte';
  import VoiceRecorder from '$lib/components/media/VoiceRecorder.svelte';

  interface Props {
    onSend: (content: string) => void;
  }

  let { onSend }: Props = $props();

  let text = $state('');
  let isRecording = $state(false);
  let textareaEl: HTMLTextAreaElement | null = $state(null);

  const canSend = $derived(text.trim().length > 0);

  $effect(() => {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 120) + 'px';
    }
  });

  function handleSend() {
    if (!canSend) return;
    onSend(text.trim());
    text = '';
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function cancelRecording() {
    isRecording = false;
  }

  function sendVoice(_blob: Blob, _duration: number) {
    isRecording = false;
    // Voice message handling — will integrate with chatStore.sendMessage
  }
</script>

<!-- Voice Recorder Overlay -->
{#if isRecording}
  <VoiceRecorder onSend={sendVoice} onCancel={cancelRecording} />
{:else}
  <div class="glass-header safe-bottom">
    <div class="flex items-end gap-2 px-3 py-2">
      <!-- Attach Button -->
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] flex-shrink-0 transition-spring active:scale-95"
        style="color: var(--text-secondary);"
        aria-label="Attach media"
      >
        <Paperclip size={22} />
      </button>

      <!-- Text Input -->
      <textarea
        bind:this={textareaEl}
        bind:value={text}
        placeholder="Message..."
        rows={1}
        class="glass-input flex-1 min-h-[44px] max-h-[120px] px-3 py-2.5 rounded-[var(--radius-md)] outline-none resize-none"
        style="color: var(--text-primary);"
        onkeydown={handleKeydown}
      ></textarea>

      <!-- Send or Mic -->
      {#if canSend}
        <button
          class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full flex-shrink-0 transition-spring active:scale-95"
          style="background: var(--color-primary); color: var(--color-primary-foreground);"
          onclick={handleSend}
          aria-label="Send message"
        >
          <Send size={20} />
        </button>
      {:else}
        <button
          class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] flex-shrink-0 transition-spring active:scale-95"
          style="color: var(--text-secondary);"
          onclick={() => (isRecording = true)}
          aria-label="Record voice"
        >
          <Mic size={22} />
        </button>
      {/if}
    </div>
  </div>
{/if}