<script lang="ts">
  import { Send, Mic, Image, Sticker, Film } from 'lucide-svelte';
  import VoiceRecorder from '$lib/components/media/VoiceRecorder.svelte';
  import StickerPicker from '$lib/components/pickers/StickerPicker.svelte';
  import GIFPicker from '$lib/components/pickers/GIFPicker.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { requestPresignedUpload, uploadToR2 } from '$lib/firebase/storage';

  interface Props {
    onSend: (content: string) => void;
    onImageSend?: (imageUrl: string, blurhash?: string) => void;
    onStickerSelect?: (sticker: string) => void;
    onGifSelect?: (gifUrl: string) => void;
  }

  let { onSend, onImageSend, onStickerSelect, onGifSelect }: Props = $props();

  type PickerPanel = 'none' | 'sticker' | 'gif';

  let text = $state('');
  let isRecording = $state(false);
  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let uploadLabel = $state('Uploading...');
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let fileInputEl: HTMLInputElement | null = $state(null);
  let activePicker = $state<PickerPanel>('none');

  const canSend = $derived(text.trim().length > 0);

  $effect(() => {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 120) + 'px';
    }
  });

  function handleInput(e: Event) {
    text = (e.target as HTMLTextAreaElement).value;
    // Close picker when typing
    if (text.length > 0 && activePicker !== 'none') {
      activePicker = 'none';
    }
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

  function togglePicker(panel: PickerPanel) {
    activePicker = activePicker === panel ? 'none' : panel;
  }

  function handleSticker(sticker: string) {
    activePicker = 'none';
    onStickerSelect?.(sticker);
  }

  function handleGif(gifUrl: string) {
    activePicker = 'none';
    onGifSelect?.(gifUrl);
  }

  function cancelRecording() {
    isRecording = false;
  }

  async function sendVoice(blob: Blob, duration: number) {
    isRecording = false;
    if (!chatStore.activeChatId || duration < 1) return;

    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

    isUploading = true;
    uploadProgress = 0;
    uploadLabel = 'Sending voice message...';

    try {
      const presign = await requestPresignedUpload(chatStore.activeChatId, file, 'voice');
      await uploadToR2(presign.uploadUrl, file, (pct) => {
        uploadProgress = pct;
      });
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

    input.value = '';

    if (!file.type.startsWith('image/')) {
      console.warn('Only image uploads are supported currently');
      return;
    }

    isUploading = true;
    uploadProgress = 0;
    uploadLabel = 'Uploading image...';

    try {
      const presign = await requestPresignedUpload(chatStore.activeChatId, file, 'images');
      await uploadToR2(presign.uploadUrl, file, (pct) => {
        uploadProgress = pct;
      });
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
        <div class="w-[18px] h-[18px] border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style="border-color: var(--color-primary); border-top-color: transparent;"></div>
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
      <!-- Picker Panels -->
      {#if activePicker === 'sticker'}
        <StickerPicker onStickerSelect={handleSticker} />
      {:else if activePicker === 'gif'}
        <GIFPicker onGifSelect={handleGif} />
      {/if}

      <div class="flex items-end gap-1.5 px-3 py-2.5">
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

        <!-- Sticker Button -->
        <button
          class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] flex-shrink-0 transition-spring active:scale-90"
          style="color: {activePicker === 'sticker' ? 'var(--color-primary)' : 'var(--text-secondary)'};"
          onclick={() => togglePicker('sticker')}
          aria-label="Stickers"
        >
          <Sticker size={22} />
        </button>

        <!-- GIF Button -->
        <button
          class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] flex-shrink-0 transition-spring active:scale-90"
          style="color: {activePicker === 'gif' ? 'var(--color-primary)' : 'var(--text-secondary)'};"
          onclick={() => togglePicker('gif')}
          aria-label="GIFs"
        >
          <Film size={22} />
        </button>

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