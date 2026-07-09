<script lang="ts">
  import { Send, Mic, Plus, Sticker, Film, Loader2 } from 'lucide-svelte';
  import VoiceRecorder from '$lib/components/media/VoiceRecorder.svelte';
  import StickerPicker from '$lib/components/pickers/StickerPicker.svelte';
  import GIFPicker from '$lib/components/pickers/GIFPicker.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
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
  let sendVisible = $state(false);

  const canSend = $derived(text.trim().length > 0);

  // Track send button visibility for animation
  $effect(() => {
    if (canSend) {
      // Small delay to ensure the DOM has canSend=false before we show
      sendVisible = true;
    } else {
      // Instant hide
      sendVisible = false;
    }
  });

  // Auto-resize textarea
  $effect(() => {
    if (textareaEl) {
      const prevHeight = textareaEl.style.height;
      textareaEl.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaEl.scrollHeight, 38), 120);
      textareaEl.style.height = newHeight + 'px';
    }
  });

  // Stop typing when input is cleared
  $effect(() => {
    if (text.trim().length === 0 && typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
      if (chatStore.activeChatId) {
        presenceManager.stopTyping(chatStore.activeChatId);
      }
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
    typingTimer = null;
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
      toastStore.error('Failed to upload image');
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
  <!-- Floating Glass Input Bar -->
  <div class="input-bar-glass safe-bottom" style="margin: 0 8px 8px; border-radius: var(--radius-pill);">
    <!-- Upload Progress Bar (overlays top of the bar) -->
    {#if isUploading}
      <div class="upload-progress-wrap">
        <div class="upload-progress-track">
          <div
            class="upload-progress-fill"
            style="width: {uploadProgress}%;"
          ></div>
        </div>
        <div class="upload-progress-info">
          <Loader2 size={14} class="upload-spinner" />
          <span class="upload-label">{uploadLabel}</span>
          <span class="upload-pct">{uploadProgress}%</span>
        </div>
      </div>
    {/if}

    <!-- Picker Panels -->
    {#if activePicker === 'sticker'}
      <StickerPicker onStickerSelect={handleSticker} />
    {:else if activePicker === 'gif'}
      <GIFPicker onGifSelect={handleGif} />
    {/if}

    <!-- Hidden file input -->
    <input
      bind:this={fileInputEl}
      type="file"
      accept="image/*"
      class="hidden"
      onchange={handleFileSelect}
    />

    <!-- Input Row -->
    <div class="input-row">
      <!-- Attachment Button -->
      <button
        class="action-btn"
        onclick={handleAttach}
        aria-label="Attach image"
      >
        <Plus size={20} />
      </button>

      <!-- Sticker Button -->
      <button
        class="action-btn"
        class:active-primary={activePicker === 'sticker'}
        onclick={() => togglePicker('sticker')}
        aria-label="Stickers"
      >
        <Sticker size={20} />
      </button>

      <!-- GIF Button -->
      <button
        class="action-btn"
        class:active-primary={activePicker === 'gif'}
        onclick={() => togglePicker('gif')}
        aria-label="GIFs"
      >
        <Film size={20} />
      </button>

      <!-- Text Input -->
      <textarea
        bind:this={textareaEl}
        value={text}
        placeholder="Message..."
        rows={1}
        class="input-field"
        oninput={handleInput}
        onkeydown={handleKeydown}
      ></textarea>

      <!-- Send / Mic Toggle -->
      <div class="send-mic-slot">
        <!-- Send Button -->
        <button
          class="send-btn"
          class:send-visible={sendVisible}
          onclick={handleSend}
          aria-label="Send message"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="transform: rotate(-45deg);"
          >
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>

        <!-- Mic Button -->
        <button
          class="mic-btn"
          class:mic-hidden={sendVisible}
          onclick={() => (isRecording = true)}
          aria-label="Record voice"
        >
          <Mic size={20} />
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Upload Progress ── */
  .upload-progress-wrap {
    position: relative;
    padding: 0 8px;
    padding-top: 8px;
  }

  .upload-progress-track {
    width: 100%;
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--input-bg);
    overflow: hidden;
  }

  .upload-progress-fill {
    height: 100%;
    border-radius: var(--radius-pill);
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    transition: width 300ms ease-out;
  }

  .upload-progress-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 2px 4px;
  }

  .upload-spinner {
    flex-shrink: 0;
    color: var(--color-primary);
    animation: spin 0.8s linear infinite;
  }

  .upload-label {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .upload-pct {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Input Row ── */
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    padding: 6px 6px 6px 2px;
  }

  /* ── Action Buttons (attach, sticker, GIF) ── */
  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    border: none;
    background: transparent;
    border-radius: 50%;
    color: var(--text-tertiary);
    cursor: pointer;
    transition:
      color 200ms ease,
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
  }

  .action-btn:hover {
    color: var(--text-secondary);
  }

  .action-btn:active {
    transform: scale(0.88);
  }

  .action-btn.active-primary {
    color: var(--color-primary);
  }

  /* ── Textarea ── */
  .input-field {
    flex: 1;
    min-height: 38px;
    max-height: 120px;
    padding: 8px 14px;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.4;
    outline: none;
    resize: none;
    font-family: var(--font-sans, inherit);
    transition: height 150ms ease-out;
  }

  .input-field::placeholder {
    color: var(--text-tertiary);
  }

  /* ── Send / Mic Slot (crossfade container) ── */
  .send-mic-slot {
    position: relative;
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    flex-shrink: 0;
  }

  /* ── Send Button ── */
  .send-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    box-shadow: 0 2px 8px rgba(5, 150, 105, 0.3);
    cursor: pointer;
    opacity: 0;
    transform: scale(0.8);
    pointer-events: none;
    transition:
      transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity 200ms ease,
      box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .send-btn.send-visible {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  .send-btn:active {
    transform: scale(0.88);
    box-shadow: 0 1px 4px rgba(5, 150, 105, 0.2);
  }

  /* ── Mic Button ── */
  .mic-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    opacity: 1;
    transition:
      color 200ms ease,
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .mic-btn.mic-hidden {
    opacity: 0;
    transform: scale(0.8);
    pointer-events: none;
  }

  .mic-btn:active {
    transform: scale(0.88);
  }
</style>