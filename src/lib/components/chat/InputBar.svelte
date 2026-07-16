<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, Send, ImagePlus, Mic, Sticker } from 'lucide-svelte';
  import VoiceRecorder from '$lib/components/media/VoiceRecorder.svelte';
  import StickerPicker from '$lib/components/pickers/StickerPicker.svelte';
  import GIFPicker from '$lib/components/pickers/GIFPicker.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { uploadFile } from '$lib/firebase/storage';
  import { prefsStore } from '$lib/stores/prefs.svelte';
  import { draftStore } from '$lib/stores/draft.svelte';

  interface Props {
    /** Initial draft text to restore */
    initialDraft?: string;
    onSend: (content: string) => void;
    onImageSend?: (imageUrl: string, blurhash?: string) => void;
    onVideoSend?: (videoUrl: string, duration?: number, thumbnailUrl?: string) => void;
    onStickerSelect?: (sticker: string) => void;
    onGifSelect?: (gifUrl: string) => void;
  }

  let { onSend, onImageSend, onVideoSend, onStickerSelect, onGifSelect, initialDraft = '' }: Props = $props();

  let message = $state(initialDraft);
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

  // ── Save draft immediately on component destroy (quick navigate) ──
  onMount(() => {
    return () => {
      if (chatStore.activeChatId && message.trim().length > 0) {
        draftStore.setDraft(chatStore.activeChatId, message);
      }
    };
  });

  // ── Draft auto-save (debounced) ──
  let draftTimer: ReturnType<typeof setTimeout> | null = null;

  function saveDraft() {
    if (!chatStore.activeChatId) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      draftStore.setDraft(chatStore.activeChatId, message);
    }, 500);
  }

  // ── Typing presence — dual trigger: oninput + $effect fallback ──
  let lastEmittedTyping = 0;

  function emitTyping() {
    if (!chatStore.activeChatId) return;
    saveDraft();
    if (!prefsStore.sendTypingIndicators) return;
    presenceManager.setTyping(chatStore.activeChatId);
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      if (chatStore.activeChatId) presenceManager.stopTyping(chatStore.activeChatId);
    }, 3000);
    lastEmittedTyping = Date.now();
  }

  // Fallback: also emit typing when message content changes (covers edge cases
  // where oninput might not fire, e.g. IME composition on mobile)
  $effect(() => {
    // Read message to track it as a dependency
    const text = message;
    if (text.trim().length > 0 && chatStore.activeChatId && prefsStore.sendTypingIndicators) {
      const now = Date.now();
      // Don't double-emit within 1.5s (oninput already handles it)
      if (now - lastEmittedTyping > 1500) {
        presenceManager.setTyping(chatStore.activeChatId);
        lastEmittedTyping = now;
      }
    } else if (text.trim().length === 0) {
      if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
        if (chatStore.activeChatId) presenceManager.stopTyping(chatStore.activeChatId);
      }
    }
  });

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
    // Clear draft after successful send
    if (chatStore.activeChatId) draftStore.clearDraft(chatStore.activeChatId);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && prefsStore.enterSend) {
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

    // Determine type
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      toastStore.info('Only images and videos are supported');
      return;
    }

    // 100MB limit for videos, 20MB for images
    const maxSize = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toastStore.info(isVideo ? 'Video too large (max 100MB)' : 'Image too large (max 20MB)');
      return;
    }

    isUploading = true;
    uploadProgress = 0;
    uploadLabel = isVideo ? 'Sending video...' : 'Sending image...';
    try {
      const folder = isVideo ? 'videos' : 'images';
      const result = await uploadFile(file, folder, file.name, (pct) => { uploadProgress = pct; });

      if (isVideo) {
        // Get video duration + generate thumbnail
        const videoMeta = await getVideoMeta(file);
        if (onVideoSend) onVideoSend(result.publicUrl, videoMeta.duration, videoMeta.thumbnailUrl);
      } else {
        if (onImageSend) onImageSend(result.publicUrl, (result as any).blurhash);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${isVideo ? 'Video' : 'Image'} upload failed:`, msg);
      toastStore.error(`Upload failed: ${msg.slice(0, 120)}`);
    } finally {
      isUploading = false;
      uploadProgress = 0;
    }
  }

  async function getVideoMeta(file: File): Promise<{ duration: number; thumbnailUrl: string | null }> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      const url = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        const duration = video.duration;
        // Seek to 1s (or 10% of duration) for thumbnail
        const seekTime = Math.min(1, duration * 0.1);
        video.currentTime = seekTime;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = 360 / Math.max(video.videoWidth, 1);
          canvas.width = 360;
          canvas.height = Math.round(video.videoHeight * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
            URL.revokeObjectURL(url);
            resolve({ duration: video.duration, thumbnailUrl });
            return;
          }
        } catch { /* fallback */ }
        URL.revokeObjectURL(url);
        resolve({ duration: video.duration, thumbnailUrl: null });
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ duration: 0, thumbnailUrl: null });
      };

      video.src = url;
    });
  }
</script>

{#if isRecording}
  <VoiceRecorder onSend={sendVoice} onCancel={cancelRecording} />
{:else}
  <div class="input-shell safe-bottom" style="padding: 0 24px 2px;">

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

    <!-- Picker panels (always mounted to preserve scroll/search state) -->
    <div class="picker-panel" class:picker-panel-hidden={!activePicker}>
      <div class="picker-animate-in">
        <div class:picker-pane-hidden={activePicker !== 'gif'}>
          <GIFPicker onGifSelect={handleGif} />
        </div>
        <div class:picker-pane-hidden={activePicker !== 'sticker'}>
          <StickerPicker onStickerSelect={handleSticker} />
        </div>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      bind:this={fileInputEl}
      type="file"
      accept="image/*,video/*"
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

  /* Picker panels — NEVER use display:none (resets scroll). Collapse via max-height. */
  .picker-panel {
    margin-bottom: 8px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    max-height: 360px;
    opacity: 1;
    transition: max-height 300ms cubic-bezier(0.22, 1, 0.36, 1),
                opacity 250ms ease,
                margin-bottom 300ms ease;
    position: relative;
  }

  .picker-panel-hidden {
    max-height: 0 !important;
    opacity: 0 !important;
    pointer-events: none;
    margin-bottom: 0 !important;
  }

  /* Hidden pane: absolute so it doesn't take flow space; never display:none */
  .picker-pane-hidden {
    position: absolute;
    inset: 0;
    visibility: hidden;
    pointer-events: none;
    z-index: -1;
    overflow: hidden;
  }

  .picker-animate-in {
    animation: pickerFadeSlide 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes pickerFadeSlide {
    0% {
      opacity: 0;
      transform: translateY(8px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Input row — full-width 3D frosted glass bar */
  .input-row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 8px 6px 6px;
    border-radius: 24px;
    background: color-mix(in srgb, var(--bg-surface) 80%, transparent);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border: 1px solid color-mix(in srgb, white 10%, transparent);
    border-bottom-color: color-mix(in srgb, black 15%, transparent);
    border-right-color: color-mix(in srgb, black 8%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 18%, transparent),
      inset 0 -1px 0 color-mix(in srgb, black 6%, transparent),
      0 -1px 0 color-mix(in srgb, white 5%, transparent),
      0 2px 4px color-mix(in srgb, black 8%, transparent),
      0 6px 20px color-mix(in srgb, black 5%, transparent);
    transition: background-color 200ms ease, box-shadow 300ms ease, border-color 300ms ease;
    width: 100%;
  }

  .input-row-focused {
    background: color-mix(in srgb, var(--bg-surface) 90%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 25%, transparent);
    border-bottom-color: color-mix(in srgb, black 12%, transparent);
    border-right-color: color-mix(in srgb, black 6%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 22%, transparent),
      inset 0 -1px 0 color-mix(in srgb, black 5%, transparent),
      0 -1px 0 color-mix(in srgb, white 8%, transparent),
      0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent),
      0 4px 12px color-mix(in srgb, black 7%, transparent),
      0 8px 28px color-mix(in srgb, black 4%, transparent);
  }

  .input-row-active {
    background: color-mix(in srgb, var(--bg-elevated, var(--bg-surface)) 78%, transparent);
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

  /* Send button — 3D raised */
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
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 90%, white), var(--color-primary));
    color: var(--color-primary-foreground);
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 250ms ease,
                background-color 200ms ease;
    box-shadow:
      0 2px 4px color-mix(in srgb, black 15%, transparent),
      0 4px 12px color-mix(in srgb, var(--color-primary) 40%, transparent),
      inset 0 1px 0 color-mix(in srgb, white 25%, transparent);
    -webkit-tap-highlight-color: transparent;
  }

  .send-btn:active {
    transform: scale(0.88);
    box-shadow:
      0 1px 2px color-mix(in srgb, black 12%, transparent),
      0 1px 4px color-mix(in srgb, var(--color-primary) 20%, transparent),
      inset 0 1px 0 color-mix(in srgb, white 15%, transparent);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>