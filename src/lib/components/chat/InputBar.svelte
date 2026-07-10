<script lang="ts">
  import { Loader2, Send, ImagePlus, Mic, Sticker } from 'lucide-svelte';
  import VoiceRecorder from '$lib/components/media/VoiceRecorder.svelte';
  import StickerPicker from '$lib/components/pickers/StickerPicker.svelte';
  import GIFPicker from '$lib/components/pickers/GIFPicker.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { uploadFile } from '$lib/firebase/storage';
  import { prefsStore } from '$lib/stores/prefs.svelte';

  interface Props {
    onSend: (content: string) => void;
    onImageSend?: (imageUrl: string, blurhash?: string) => void;
    onStickerSelect?: (sticker: string) => void;
    onGifSelect?: (gifUrl: string) => void;
  }

  let { onSend, onImageSend, onStickerSelect, onGifSelect }: Props = $props();

  let message = $state('');
  let isRecording = $state(false);
  let isTrayOpen = $state(false);
  let isGifOpen = $state(false);
  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let uploadLabel = $state('Uploading...');
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let fileInputEl: HTMLInputElement | null = $state(null);
  let isFocused = $state(false);

  let hasText = $derived(message.trim().length > 0);
  let activePicker = $derived(isGifOpen ? 'gif' : isTrayOpen ? 'sticker' : null);

  // ── Auto-resize ──
  $effect(() => {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 128) + 'px';
    }
  });

  // ── Stop typing when cleared ──
  $effect(() => {
    if (message.trim().length === 0 && typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
      if (chatStore.activeChatId) presenceManager.stopTyping(chatStore.activeChatId);
    }
  });

  // ── Typing presence ──
  function emitTyping() {
    if (!chatStore.activeChatId) return;
    if (!prefsStore.sendTypingIndicators) return;
    presenceManager.setTyping(chatStore.activeChatId);
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      if (chatStore.activeChatId) presenceManager.stopTyping(chatStore.activeChatId);
    }, 2000);
  }

  function clearTyping() {
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = null;
    if (chatStore.activeChatId) presenceManager.stopTyping(chatStore.activeChatId);
  }

  // ── Send ──
  function handleSend() {
    if (!hasText) return;
    onSend(message.trim());
    message = '';
    if (textareaEl) textareaEl.style.height = 'auto';
    clearTyping();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Pickers ──
  function openPicker(type: 'sticker' | 'gif') {
    if (type === 'gif') {
      isGifOpen = !isGifOpen;
      isTrayOpen = false;
    } else {
      isTrayOpen = !isTrayOpen;
      isGifOpen = false;
    }
  }

  function closeAllPickers() {
    isTrayOpen = false;
    isGifOpen = false;
  }

  // ── Sticker ──
  function handleSticker(sticker: string) {
    closeAllPickers();
    onStickerSelect?.(sticker);
  }

  // ── GIF ──
  function handleGif(gifUrl: string) {
    closeAllPickers();
    onGifSelect?.(gifUrl);
  }

  // ── Voice ──
  function handleVoiceRecord() {
    isRecording = true;
  }

  function cancelRecording() {
    isRecording = false;
  }

  async function sendVoice(blob: Blob, duration: number) {
    isRecording = false;
    if (!chatStore.activeChatId || duration < 1) return;
    isUploading = true;
    uploadProgress = 0;
    uploadLabel = 'Sending voice...';
    try {
      const result = await uploadFile(blob, 'voice', `voice-${Date.now()}.webm`, (pct) => { uploadProgress = pct; });
      await chatStore.sendVoiceMessage(chatStore.activeChatId, result.publicUrl, duration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Voice upload failed:', msg);
      toastStore.error(`Voice failed: ${msg.slice(0, 120)}`);
    } finally {
      isUploading = false;
      uploadProgress = 0;
    }
  }

  // ── Gallery upload (R2) ──
  function handleMediaUpload() {
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
      const result = await uploadFile(file, 'images', file.name, (pct) => { uploadProgress = pct; });
      if (onImageSend) onImageSend(result.publicUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Image upload failed:', msg);
      toastStore.error(`Upload failed: ${msg.slice(0, 120)}`);
    } finally {
      isUploading = false;
      uploadProgress = 0;
    }
  }
</script>

{#if isRecording}
  <VoiceRecorder onSend={sendVoice} onCancel={cancelRecording} />
{:else}
  <div class="input-shell safe-bottom" style="padding: 0 8px 2px; margin-bottom: 62px;">

    <!-- Upload progress -->
    {#if isUploading}
      <div class="upload-progress">
        <Loader2 size={12} class="animate-spin" style="color: var(--color-primary);" />
        <div class="upload-bar">
          <div class="upload-bar-fill" style="width: {uploadProgress}%;"></div>
        </div>
        <span class="upload-pct">{Math.round(uploadProgress)}%</span>
      </div>
    {/if}

    <!-- Picker panels -->
    {#if activePicker}
      <div class="picker-panel">
        {#if activePicker === 'gif'}
          <div class="picker-animate-in">
            <GIFPicker onGifSelect={handleGif} />
          </div>
        {:else}
          <div class="picker-animate-in">
            <StickerPicker onStickerSelect={handleSticker} />
          </div>
        {/if}
      </div>
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
    <div class="input-row" class:input-row-focused={isFocused} class:input-row-active={hasText} class:input-row-picker-open={!!activePicker}>

      <!-- Left: Image upload -->
      <button onclick={handleMediaUpload} aria-label="Add media"
        class="input-action-btn">
        <ImagePlus size={20} />
      </button>

      <!-- GIF button -->
      <button
        onclick={() => openPicker('gif')}
        class="input-action-btn action-gif"
        class:action-active={isGifOpen}
        style="color: {isGifOpen ? 'var(--color-primary)' : 'var(--text-tertiary)'};"
        aria-label="GIF picker"
      >
        <span class="gif-btn-label">GIF</span>
      </button>

      <textarea
        bind:this={textareaEl}
        bind:value={message}
        oninput={emitTyping}
        onkeydown={handleKeydown}
        onfocus={() => (isFocused = true)}
        onblur={() => (isFocused = false)}
        placeholder="Message..."
        rows="1"
        class="input-textarea"
      ></textarea>

      {#if hasText}
        <button
          onclick={() => openPicker('sticker')}
          class="input-action-btn"
          class:action-active={isTrayOpen}
          style="color: {isTrayOpen ? 'var(--color-primary)' : 'var(--text-tertiary)'};"
        >
          <Sticker size={18} />
        </button>

        <button onclick={handleSend}
          class="send-btn">
          <Send size={18} />
        </button>
      {:else}
        <button
          onclick={() => openPicker('sticker')}
          class="input-action-btn"
          class:action-active={isTrayOpen}
          style="color: {isTrayOpen ? 'var(--color-primary)' : 'var(--text-tertiary)'};"
        >
          <Sticker size={18} />
        </button>

        <button
          onclick={handleVoiceRecord}
          class="input-action-btn">
          <Mic size={20} />
        </button>
      {/if}

    </div>
  </div>
{/if}

<style>
  .input-shell {
    flex-shrink: 0;
    padding-left: 16px;
    padding-right: 16px;
    animation: inputSlideUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes inputSlideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Upload progress */
  .upload-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px 6px;
    animation: fadeIn 200ms ease both;
  }

  .upload-bar {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    overflow: hidden;
    background: var(--input-bg);
  }

  .upload-bar-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--color-primary);
    transition: width 200ms ease;
  }

  .upload-pct {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
    min-width: 28px;
    text-align: right;
  }

  /* Picker panels */
  .picker-panel {
    margin-bottom: 8px;
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .picker-animate-in {
    animation: pickerExpand 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes pickerExpand {
    0% {
      opacity: 0;
      max-height: 0;
      transform: translateY(8px);
    }
    100% {
      opacity: 1;
      max-height: 340px;
      transform: translateY(0);
    }
  }

  /* Input row */
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 4px 4px 4px 2px;
    border-radius: 28px;
    background: var(--bg-surface);
    border: 1.5px solid var(--border-subtle);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.03);
    transition: border-color 250ms ease, box-shadow 250ms ease, background-color 250ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .input-row-focused {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent),
                0 1px 4px rgba(0, 0, 0, 0.04),
                0 4px 16px rgba(0, 0, 0, 0.03);
    background: var(--bg-surface);
  }

  .input-row-active {
    border-color: color-mix(in srgb, var(--color-primary) 25%, var(--border-subtle));
  }

  .input-row-picker-open {
    border-bottom-left-radius: var(--radius-lg);
    border-bottom-right-radius: var(--radius-lg);
  }

  /* Textarea */
  .input-textarea {
    flex: 1;
    resize: none;
    background: transparent;
    outline: none;
    border: none;
    font-size: 15px;
    line-height: 1.45;
    padding: 6px 4px;
    max-height: 128px;
    min-height: 36px;
    color: var(--text-primary);
    font-family: var(--font-sans, inherit);
    transition: opacity 150ms ease;
  }

  .input-textarea::placeholder {
    color: var(--text-tertiary);
  }

  /* Action buttons */
  .input-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    min-width: 38px;
    min-height: 38px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
                color 150ms ease,
                background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .input-action-btn:active {
    transform: scale(0.88);
  }

  .input-action-btn.action-active {
    background: var(--color-primary-light, #d1fae5);
    color: var(--color-primary);
  }

  .action-gif {
    position: relative;
  }

  .gif-btn-label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.03em;
    line-height: 1;
  }

  /* Send button */
  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    min-width: 38px;
    min-height: 38px;
    border-radius: 50%;
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 200ms ease,
                background-color 200ms ease;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 35%, transparent);
    -webkit-tap-highlight-color: transparent;
  }

  .send-btn:active {
    transform: scale(0.88);
    box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>