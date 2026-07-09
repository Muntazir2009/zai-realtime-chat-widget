<script lang="ts">
  import { Send, Mic, Plus, Sticker, Film, Loader2, Smile } from 'lucide-svelte';
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
  let showActions = $state(false);

  const canSend = $derived(text.trim().length > 0);

  // Track send button visibility for animation
  $effect(() => {
    sendVisible = canSend;
  });

  // Show action buttons when focused or text exists
  $effect(() => {
    showActions = text.length > 0 || activePicker !== 'none' || isUploading;
  });

  // Auto-resize textarea
  $effect(() => {
    if (textareaEl) {
      const prevHeight = textareaEl.style.height;
      textareaEl.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaEl.scrollHeight, 36), 130);
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
    }, 2000);
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
    uploadLabel = 'Sending voice...';

    try {
      const presign = await requestPresignedUpload(chatStore.activeChatId, file, 'voice');
      await uploadToR2(presign.uploadUrl, file, (pct) => {
        uploadProgress = pct;
      });
      await chatStore.sendVoiceMessage(chatStore.activeChatId, presign.publicUrl, duration);
    } catch (err) {
      console.error('Voice upload failed:', err);
      toastStore.error('Failed to send voice message');
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
      toastStore.info('Only images are supported');
      return;
    }

    isUploading = true;
    uploadProgress = 0;
    uploadLabel = 'Sending image...';

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
  <div class="input-shell safe-bottom">
    <!-- Upload Progress -->
    {#if isUploading}
      <div class="upload-progress-wrap">
        <div class="upload-progress-track">
          <div class="upload-progress-fill" style="width: {uploadProgress}%;"></div>
        </div>
        <div class="upload-progress-info">
          <Loader2 size={13} class="upload-spinner" />
          <span class="upload-label">{uploadLabel}</span>
          <span class="upload-pct">{Math.round(uploadProgress)}%</span>
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
      <!-- Left Actions -->
      <div class="left-actions" style="width: {showActions ? 'auto' : '0'}; opacity: {showActions ? '1' : '0'}; overflow: hidden;">
        <button class="act-btn" onclick={handleAttach} aria-label="Attach image">
          <Plus size={19} />
        </button>
        <button
          class="act-btn"
          class:act-active={activePicker === 'sticker'}
          onclick={() => togglePicker('sticker')}
          aria-label="Stickers"
        >
          <Sticker size={19} />
        </button>
        <button
          class="act-btn"
          class:act-active={activePicker === 'gif'}
          onclick={() => togglePicker('gif')}
          aria-label="GIFs"
        >
          <Film size={19} />
        </button>
      </div>

      <!-- Text Input -->
      <textarea
        bind:this={textareaEl}
        value={text}
        placeholder="Message..."
        rows={1}
        class="input-field"
        oninput={handleInput}
        onkeydown={handleKeydown}
        onfocus={() => (showActions = true)}
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
            class="send-icon"
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
          <Mic size={19} />
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Input Shell ── */
  .input-shell {
    flex-shrink: 0;
    margin: 0 6px 6px;
    padding: 4px;
    padding-bottom: max(4px, env(safe-area-inset-bottom, 0px) + 4px);
    border-radius: var(--radius-pill);
    background: rgba(22, 22, 30, 0.92);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow:
      0 -0.5px 0 rgba(255, 255, 255, 0.04),
      0 2px 12px rgba(0, 0, 0, 0.15),
      0 0.5px 2px rgba(0, 0, 0, 0.1),
      0 0 0 0.5px rgba(220, 38, 38, 0.04);
  }

  .input-shell:focus-within {
    border-color: rgba(220, 38, 38, 0.2);
    box-shadow:
      0 -0.5px 0 rgba(255, 255, 255, 0.04),
      0 2px 12px rgba(0, 0, 0, 0.15),
      0 0 5px 1px rgba(220, 38, 38, 0.08);
  }

  /* ── Upload Progress ── */
  .upload-progress-wrap {
    position: relative;
    padding: 0 8px;
    padding-top: 6px;
  }

  .upload-progress-track {
    width: 100%;
    height: 2.5px;
    border-radius: var(--radius-pill);
    background: var(--input-bg);
    overflow: hidden;
  }

  .upload-progress-fill {
    height: 100%;
    border-radius: var(--radius-pill);
    background: linear-gradient(90deg, #dc2626, #ef4444);
    transition: width 200ms ease-out;
  }

  .upload-progress-info {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 2px 2px;
  }

  .upload-spinner {
    flex-shrink: 0;
    color: var(--color-primary);
    animation: spin 0.8s linear infinite;
  }

  .upload-label {
    flex: 1;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .upload-pct {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary);
    font-variant-numeric: tabular-nums;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Input Row ── */
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 2px 4px 2px 2px;
  }

  /* ── Left Actions ── */
  .left-actions {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
    transition: width 250ms cubic-bezier(0.34, 1.56, 0.64, 1),
                opacity 200ms ease;
  }

  .act-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    border: none;
    background: transparent;
    border-radius: 50%;
    color: var(--text-tertiary);
    cursor: pointer;
    transition:
      color 200ms ease,
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
      background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .act-btn:active {
    transform: scale(0.85);
    background: var(--input-bg);
  }

  .act-btn.act-active {
    color: var(--color-primary);
  }

  /* ── Textarea ── */
  .input-field {
    flex: 1;
    min-height: 36px;
    max-height: 130px;
    padding: 7px 12px;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.4;
    outline: none;
    resize: none;
    font-family: var(--font-sans, inherit);
    transition: height 120ms ease-out;
    -webkit-user-select: text;
    user-select: text;
  }

  .input-field::placeholder {
    color: var(--text-tertiary);
    font-size: 15px;
  }

  /* ── Send / Mic Slot ── */
  .send-mic-slot {
    position: relative;
    width: 34px;
    height: 34px;
    min-width: 34px;
    min-height: 34px;
    flex-shrink: 0;
  }

  /* ── Send Button ── */
  .send-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    box-shadow: 0 2px 10px rgba(220, 38, 38, 0.35);
    cursor: pointer;
    opacity: 0;
    transform: scale(0.7) rotate(-30deg);
    pointer-events: none;
    transition:
      transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity 180ms ease,
      box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .send-btn.send-visible {
    opacity: 1;
    transform: scale(1) rotate(0deg);
    pointer-events: auto;
  }

  .send-btn:active {
    transform: scale(0.88) !important;
    box-shadow: 0 1px 4px rgba(220, 38, 38, 0.2);
  }

  .send-icon {
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .send-btn.send-visible .send-icon {
    transform: rotate(-45deg);
  }

  /* ── Mic Button ── */
  .mic-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
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
    transform: scale(0.7);
    pointer-events: none;
  }

  .mic-btn:active {
    transform: scale(0.85);
  }
</style>