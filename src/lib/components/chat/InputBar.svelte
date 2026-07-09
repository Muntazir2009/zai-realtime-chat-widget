<script lang="ts">
  import { Loader2 } from 'lucide-svelte';
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

  type PickerPanel = 'none' | 'sticker' | 'gif' | 'emoji';

  // ── Core state ──
  let message = $state('');
  let isRecording = $state(false);
  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let uploadLabel = $state('Uploading...');
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let fileInputEl: HTMLInputElement | null = $state(null);
  let activePicker = $state<PickerPanel>('none');

  // ── Derived ──
  let hasText = $derived(message.trim().length > 0);

  // ── Auto-resize textarea ──
  $effect(() => {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      const newHeight = Math.min(textareaEl.scrollHeight, 128);
      textareaEl.style.height = newHeight + 'px';
    }
  });

  // ── Stop typing when input is cleared ──
  $effect(() => {
    if (message.trim().length === 0 && typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
      if (chatStore.activeChatId) {
        presenceManager.stopTyping(chatStore.activeChatId);
      }
    }
  });

  // ── Input handler ──
  function handleInput(e: Event) {
    message = (e.target as HTMLTextAreaElement).value;
    if (message.length > 0 && activePicker !== 'none') {
      activePicker = 'none';
    }
    emitTyping();
  }

  // ── Typing presence ──
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

  function clearTyping() {
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = null;
    if (chatStore.activeChatId) {
      presenceManager.stopTyping(chatStore.activeChatId);
    }
  }

  // ── Send message (dispatches through chat store via onSend prop) ──
  function handleSend() {
    if (!hasText) return;
    onSend(message.trim());
    message = '';
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
    clearTyping();
  }

  // ── Keyboard: Enter to send, Shift+Enter for newline ──
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Picker toggle ──
  function togglePicker(panel: PickerPanel) {
    activePicker = activePicker === panel ? 'none' : panel;
  }

  // ── Emoji: insert at cursor position ──
  function handleEmojiSelect(emoji: string) {
    if (textareaEl) {
      const start = textareaEl.selectionStart;
      const end = textareaEl.selectionEnd;
      message = message.slice(0, start) + emoji + message.slice(end);
      requestAnimationFrame(() => {
        const pos = start + emoji.length;
        textareaEl?.setSelectionRange(pos, pos);
        textareaEl?.focus();
      });
    } else {
      message += emoji;
    }
    emitTyping();
  }

  // ── Sticker: dispatch through onStickerSelect prop ──
  function handleSticker(sticker: string) {
    activePicker = 'none';
    onStickerSelect?.(sticker);
  }

  // ── GIF: dispatch through onGifSelect prop ──
  function handleGif(gifUrl: string) {
    activePicker = 'none';
    onGifSelect?.(gifUrl);
  }

  // ── Voice recording ──
  function handleVoiceToggle() {
    isRecording = true;
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

  // ── Gallery / media upload (R2 via presigned URL) ──
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

  // ── Inline emoji picker data ──
  const emojiCategories = [
    { label: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','🤖'] },
    { label: '👋', emojis: ['👋','🤚','✋','🖐️','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶'] },
    { label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💗','💖','💝','💘','💟','♥️','❣️','💞','💓','💓','💗','💞'] },
    { label: '🎉', emojis: ['🎉','🎊','🎁','🏆','⭐','🌟','💫','✨','⚡','🔥','💥','💢','💦','💤','🌈','☀️','🌙','💎','🎵','🎶','☕','🍕','🎮','📱','💡','🚀','💰','💵','💎','👑'] },
    { label: '🐱', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🦅','🦆','🦉','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🦖'] },
  ];

  let activeEmojiCategory = $state(0);
  const currentEmojis = $derived(emojiCategories[activeEmojiCategory]?.emojis ?? []);
</script>

<!-- ============================================================ -->
<!-- Voice Recorder Overlay                                       -->
<!-- ============================================================ -->
{#if isRecording}
  <VoiceRecorder onSend={sendVoice} onCancel={cancelRecording} />
{:else}
  <!-- ============================================================ -->
  <!-- Glass Input Shell                                           -->
  <!-- ============================================================ -->
  <div class="input-shell safe-bottom">

    <!-- Upload Progress Bar -->
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

    <!-- Picker Panels (slide up above input row) -->
    {#if activePicker === 'sticker'}
      <StickerPicker onStickerSelect={handleSticker} />
    {:else if activePicker === 'gif'}
      <GIFPicker onGifSelect={handleGif} />
    {:else if activePicker === 'emoji'}
      <div class="emoji-picker-panel animate-slide-up">
        <div class="emoji-category-tabs">
          {#each emojiCategories as cat, i}
            <button
              class="emoji-cat-btn"
              class:emoji-cat-active={activeEmojiCategory === i}
              onclick={() => (activeEmojiCategory = i)}
              aria-label="{cat.label} emoji category"
            >
              {cat.label}
            </button>
          {/each}
        </div>
        <div class="emoji-grid">
          {#each currentEmojis as emoji}
            <button
              class="emoji-item"
              onclick={() => handleEmojiSelect(emoji)}
              aria-label="Insert {emoji}"
            >
              {emoji}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Hidden file input for gallery -->
    <input
      bind:this={fileInputEl}
      type="file"
      accept="image/*"
      class="hidden"
      onchange={handleFileSelect}
    />

    <!-- ============================================================ -->
    <!-- Input Row: [+] [textarea] [GIF] [😊] [Send/Mic]            -->
    <!-- ============================================================ -->
    <div class="input-row">

      <!-- Tray toggle — opens sticker/media picker -->
      <button
        class="action-btn"
        class:action-active={activePicker === 'sticker'}
        onclick={() => togglePicker('sticker')}
        aria-label="Stickers & media"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      <!-- Auto-growing textarea -->
      <textarea
        bind:this={textareaEl}
        value={message}
        oninput={handleInput}
        onkeydown={handleKeydown}
        placeholder="Message..."
        rows={1}
        class="input-field"
      ></textarea>

      <!-- GIF button -->
      <button
        class="action-btn"
        class:action-active={activePicker === 'gif'}
        onclick={() => togglePicker('gif')}
        aria-label="Send GIF"
      >
        <span class="gif-label">GIF</span>
      </button>

      <!-- Emoji button -->
      <button
        class="action-btn"
        class:action-active={activePicker === 'emoji'}
        onclick={() => togglePicker('emoji')}
        aria-label="Emoji picker"
      >
        <span class="emoji-trigger">😊</span>
      </button>

      <!-- Send / Mic toggle -->
      {#if hasText}
        <button
          class="send-btn send-visible"
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
      {:else}
        <button
          class="mic-btn"
          onclick={handleVoiceToggle}
          aria-label="Record voice"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" x2="12" y1="19" y2="22"></line>
          </svg>
        </button>
      {/if}

    </div>
  </div>
{/if}

<style>
  /* ── Input Shell (Discord/Telegram glass pill) ── */
  .input-shell {
    flex-shrink: 0;
    margin: 0 6px 6px;
    padding: 5px 6px;
    padding-bottom: max(5px, env(safe-area-inset-bottom, 0px) + 4px);
    border-radius: 1.6rem;
    background: rgba(17, 17, 20, 0.90);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow:
      0 -0.5px 0 rgba(255, 255, 255, 0.04),
      0 2px 12px rgba(0, 0, 0, 0.15),
      0 0.5px 2px rgba(0, 0, 0, 0.1);
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }

  .input-shell:focus-within {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 -0.5px 0 rgba(255, 255, 255, 0.06),
      0 2px 16px rgba(0, 0, 0, 0.2),
      0 0.5px 2px rgba(0, 0, 0, 0.1);
  }

  /* ── Upload Progress ── */
  .upload-progress-wrap {
    position: relative;
    padding: 0 8px;
    padding-top: 4px;
  }

  .upload-progress-track {
    width: 100%;
    height: 2.5px;
    border-radius: 9999px;
    background: var(--input-bg, #1e1e28);
    overflow: hidden;
  }

  .upload-progress-fill {
    height: 100%;
    border-radius: 9999px;
    background: linear-gradient(90deg, var(--color-primary, #dc2626), #ef4444);
    transition: width 200ms ease-out;
  }

  .upload-progress-info {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 2px 2px;
  }

  .upload-spinner {
    flex-shrink: 0;
    color: var(--color-primary, #dc2626);
    animation: spin 0.8s linear infinite;
  }

  .upload-label {
    flex: 1;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary, #a1a1aa);
  }

  .upload-pct {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary, #dc2626);
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
    padding: 1px 2px 1px 2px;
  }

  /* ── Action Buttons (circular, always visible) ── */
  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    min-width: 38px;
    min-height: 38px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-tertiary, #71717a);
    cursor: pointer;
    transition:
      color 200ms ease,
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
      background 150ms ease;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }

  .action-btn:active {
    transform: scale(0.85);
    background: var(--input-bg, #1e1e28);
  }

  .action-btn.action-active {
    color: var(--color-primary, #dc2626);
  }

  /* GIF label styling */
  .gif-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  /* Emoji trigger */
  .emoji-trigger {
    font-size: 18px;
    line-height: 1;
  }

  /* ── Textarea ── */
  .input-field {
    flex: 1;
    min-height: 38px;
    max-height: 128px;
    padding: 8px 10px;
    border: none;
    border-radius: 1.2rem;
    background: transparent;
    color: var(--text-primary, #f1f1f4);
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
    color: var(--text-tertiary, #71717a);
    font-size: 15px;
  }

  /* ── Send Button ── */
  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    min-width: 38px;
    min-height: 38px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary, #dc2626);
    color: var(--color-primary-foreground, #ffffff);
    box-shadow: 0 2px 10px rgba(220, 38, 38, 0.35);
    cursor: pointer;
    flex-shrink: 0;
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    min-width: 38px;
    min-height: 38px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-tertiary, #71717a);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      color 200ms ease,
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
  }

  .mic-btn:active {
    transform: scale(0.85);
  }

  /* ── Inline Emoji Picker Panel ── */
  .emoji-picker-panel {
    padding: 6px 8px 4px;
    border-bottom: 0.5px solid rgba(255, 255, 255, 0.06);
  }

  .emoji-category-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-bottom: 6px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .emoji-category-tabs::-webkit-scrollbar {
    display: none;
  }

  .emoji-cat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 38px;
    min-height: 34px;
    padding: 0 4px;
    border: none;
    border-radius: 10px;
    background: transparent;
    font-size: 18px;
    cursor: pointer;
    opacity: 0.45;
    transition:
      opacity 200ms ease,
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
      background 150ms ease;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }

  .emoji-cat-btn.emoji-cat-active {
    opacity: 1;
    background: var(--input-bg, #1e1e28);
  }

  .emoji-cat-btn:active {
    transform: scale(0.88);
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 0;
    max-height: 180px;
    overflow-y: auto;
    padding-bottom: 2px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
  }

  .emoji-grid::-webkit-scrollbar {
    width: 3px;
  }

  .emoji-grid::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .emoji-item {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    min-height: 40px;
    border: none;
    border-radius: 10px;
    background: transparent;
    font-size: 22px;
    cursor: pointer;
    transition:
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
      background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .emoji-item:active {
    transform: scale(0.85);
    background: var(--input-bg, #1e1e28);
  }
</style>