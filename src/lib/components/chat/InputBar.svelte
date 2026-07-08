<script lang="ts">
  import { Send, Paperclip, Mic, Image, X, Loader2 } from 'lucide-svelte';
  import VoiceRecorder from '$lib/components/media/VoiceRecorder.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { requestPresignedUpload, uploadToR2, confirmUpload } from '$lib/firebase/storage';
  import { generateIdempotencyKey } from '$lib/utils/idempotency';

  interface Props {
    onSend: (content: string) => void;
    onImageSend?: (imageUrl: string, blurhash?: string) => void;
  }

  let { onSend, onImageSend }: Props = $props();

  let text = $state('');
  let isRecording = $state(false);
  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let uploadLabel = $state('Uploading...');
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let fileInputEl: HTMLInputElement | null = $state(null);

  const canSend = $derived(text.trim().length > 0);

  $effect(() => {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 120) + 'px';
    }
  });

  function handleInput(e: Event) {
    text = (e.target as HTMLTextAreaElement).value;
    emitTyping();
  }

  function emitTyping() {
    if (!chatStore.activeChatId) return;
    presenceManager.setTyping(chatStore.activeChatId);
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      if (chatStore.activeChatId) {
        presenceManager.stopTyping(chatStore.activeChatId);
      }
    }, 2500);
  }

  function handleSend() {
    if (!canSend) return;
    onSend(text.trim());
    text = '';
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
    // Stop typing
    if (typingTimer) clearTimeout(typingTimer);
    if (chatStore.activeChatId) {
      presenceManager.stopTyping(chatStore.activeChatId);
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

  async function sendVoice(blob: Blob, duration: number) {
    isRecording = false;
    if (!chatStore.activeChatId || duration < 1) return;

    // Create a File from the blob
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

    isUploading = true;
    uploadProgress = 0;
    uploadLabel = 'Sending voice message...';

    try {
      // 1. Get presigned URL
      const presign = await requestPresignedUpload(chatStore.activeChatId, file, 'voice');

      // 2. Upload to R2
      await uploadToR2(presign.uploadUrl, file, (pct) => {
        uploadProgress = pct;
      });

      // 3. Send voice message via chatStore
      await chatStore.sendVoiceMessage(chatStore.activeChatId, presign.publicUrl, duration);
    } catch (err) {
      console.error('Voice upload failed:', err);
    } finally {
      isUploading = false;
      uploadProgress = 0;
    }
  }

  function handleAttach() {
    fileInputEl?.click();
  }

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !chatStore.activeChatId) return;

    // Reset input
    input.value = '';

    if (!file.type.startsWith('image/')) {
      // For now, only support images
      console.warn('Only image uploads are supported currently');
      return;
    }

    isUploading = true;
    uploadProgress = 0;
    uploadLabel = 'Uploading image...';

    try {
      // 1. Get presigned URL
      const presign = await requestPresignedUpload(chatStore.activeChatId, file, 'images');

      // 2. Upload to R2
      await uploadToR2(presign.uploadUrl, file, (pct) => {
        uploadProgress = pct;
      });

      // 3. Send image message via chatStore
      if (onImageSend) {
        onImageSend(presign.publicUrl);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      isUploading = false;
      uploadProgress = 0;
    }
  }
</script>

<!-- Voice Recorder Overlay -->
{#if isRecording}
  <VoiceRecorder onSend={sendVoice} onCancel={cancelRecording} />
{:else}
  <!-- Upload Progress Bar -->
  {#if isUploading}
    <div class="safe-bottom px-4 py-2.5" style="background: var(--glass-bg); backdrop-filter: var(--glass-blur); border-top: var(--border-subtle);">
      <div class="flex items-center gap-3">
        <Loader2 size={18} class="animate-spin flex-shrink-0" style="color: var(--color-primary);" />
        <div class="flex-1">
          <p class="text-xs font-medium mb-1" style="color: var(--text-primary);">{uploadLabel}</p>
          <div class="w-full h-1.5 rounded-full overflow-hidden" style="background: var(--input-bg);">
            <div
              class="h-full rounded-full transition-all duration-300 ease-out"
              style="width: {uploadProgress}%; background: var(--color-primary);"
            ></div>
          </div>
        </div>
        <span class="text-xs font-medium" style="color: var(--text-tertiary);">{uploadProgress}%</span>
      </div>
    </div>
  {:else}
    <div class="safe-bottom" style="background: var(--glass-bg); backdrop-filter: var(--glass-blur); border-top: var(--border-subtle);">
      <div class="flex items-end gap-2 px-3 py-2.5">
        <!-- Attach Button -->
        <button
          class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] flex-shrink-0 transition-spring active:scale-90"
          style="color: var(--text-secondary);"
          onclick={handleAttach}
          aria-label="Attach image"
        >
          <Image size={22} />
        </button>

        <!-- Hidden file input -->
        <input
          bind:this={fileInputEl}
          type="file"
          accept="image/*"
          class="hidden"
          onchange={handleFileSelect}
        />

        <!-- Text Input -->
        <textarea
          bind:this={textareaEl}
          value={text}
          placeholder="Message..."
          rows={1}
          class="glass-input flex-1 min-h-[44px] max-h-[120px] px-3.5 py-2.5 rounded-[2rem] outline-none resize-none text-[15px] leading-relaxed transition-shadow duration-200"
          style="color: var(--text-primary);"
          oninput={handleInput}
          onkeydown={handleKeydown}
        ></textarea>

        <!-- Send or Mic -->
        {#if canSend}
          <button
            class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full flex-shrink-0 transition-spring active:scale-90 shadow-md"
            style="background: var(--color-primary); color: var(--color-primary-foreground);"
            onclick={handleSend}
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        {:else}
          <button
            class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] flex-shrink-0 transition-spring active:scale-90"
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
{/if}