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

  let message = $state('');
  let isRecording = $state(false);
  let isTrayOpen = $state(false);
  let isEmojiOpen = $state(false);
  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let uploadLabel = $state('Uploading...');
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let fileInputEl: HTMLInputElement | null = $state(null);

  let hasText = $derived(message.trim().length > 0);
  let activePicker = $derived.by(() => {
    if (isEmojiOpen) return 'emoji' as const;
    if (isTrayOpen) return 'sticker' as const;
    return 'none' as const;
  });

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

  // ── Emoji ──
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

  // ── Sticker ──
  function handleSticker(sticker: string) {
    isTrayOpen = false;
    onStickerSelect?.(sticker);
  }

  // ── GIF ──
  function handleGif(gifUrl: string) {
    isTrayOpen = false;
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
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
    isUploading = true;
    uploadProgress = 0;
    uploadLabel = 'Sending voice...';
    try {
      const presign = await requestPresignedUpload(chatStore.activeChatId, file, 'voice');
      await uploadToR2(presign.uploadUrl, file, (pct) => { uploadProgress = pct; });
      await chatStore.sendVoiceMessage(chatStore.activeChatId, presign.publicUrl, duration);
    } catch (err) {
      console.error('Voice upload failed:', err);
      toastStore.error('Failed to send voice message');
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
      const presign = await requestPresignedUpload(chatStore.activeChatId, file, 'images');
      await uploadToR2(presign.uploadUrl, file, (pct) => { uploadProgress = pct; });
      if (onImageSend) onImageSend(presign.publicUrl);
    } catch (err) {
      console.error('Upload failed:', err);
      toastStore.error('Failed to upload image');
    } finally {
      isUploading = false;
      uploadProgress = 0;
    }
  }

  // ── Emoji data ──
  const emojiCategories = [
    { label: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','🤖'] },
    { label: '👋', emojis: ['👋','🤚','✋','🖐️','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶'] },
    { label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💗','💖','💝','💘','💟','♥️','❣️','💞','💓','💗','💞'] },
    { label: '🎉', emojis: ['🎉','🎊','🎁','🏆','⭐','🌟','💫','✨','⚡','🔥','💥','💢','💦','💤','🌈','☀️','🌙','💎','🎵','🎶','☕','🍕','🎮','📱','💡','🚀','💰','💵','💎','👑'] },
    { label: '🐱', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🦅','🦆','🦉','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🦖'] },
  ];
  let activeEmojiCategory = $state(0);
  const currentEmojis = $derived(emojiCategories[activeEmojiCategory]?.emojis ?? []);
</script>

{#if isRecording}
  <VoiceRecorder onSend={sendVoice} onCancel={cancelRecording} />
{:else}
  <div class="safe-bottom" style="margin: 0 6px 6px;">

    <!-- Upload progress -->
    {#if isUploading}
      <div class="flex items-center gap-1.5 px-3 pb-1.5">
        <Loader2 size={12} class="animate-spin text-red-500" />
        <div class="flex-1 h-[3px] rounded-full overflow-hidden" style="background: rgba(255,255,255,0.08);">
          <div class="h-full rounded-full bg-red-500 transition-all duration-200" style="width: {uploadProgress}%;"></div>
        </div>
        <span class="text-[11px] font-semibold tabular-nums" style="color: var(--text-tertiary);">{Math.round(uploadProgress)}%</span>
      </div>
    {/if}

    <!-- Picker panels -->
    {#if activePicker === 'sticker'}
      <StickerPicker onStickerSelect={handleSticker} />
    {:else if activePicker === 'emoji'}
      <div class="animate-slide-up" style="background: var(--bg-surface); border-top: 1px solid rgba(255,255,255,0.06);">
        <div class="flex items-center gap-0.5 px-2 pt-2 pb-1 overflow-x-auto" style="scrollbar-width: none;">
          {#each emojiCategories as cat, i}
            <button
              class="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-all duration-150 active:scale-90"
              style="background: {activeEmojiCategory === i ? 'var(--input-bg)' : 'transparent'}; opacity: {activeEmojiCategory === i ? '1' : '0.45'};"
              onclick={() => (activeEmojiCategory = i)}
            >
              {cat.label}
            </button>
          {/each}
        </div>
        <div class="grid grid-cols-8 gap-0 px-1 pb-2 pt-1" style="max-height: 180px; overflow-y: auto;">
          {#each currentEmojis as emoji}
            <button
              class="w-full aspect-square flex items-center justify-center text-xl rounded-lg transition-all duration-150 active:scale-90"
              onclick={() => handleEmojiSelect(emoji)}
            >
              {emoji}
            </button>
          {/each}
        </div>
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

    <!-- ═══════════════════════════════════════════════════════ -->
    <!-- Input Row — exact MessageInput.svelte visual            -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div class="flex items-end gap-1.5 bg-[#111114]/90 backdrop-blur-md
                border border-white/[0.06] rounded-[1.6rem] px-2 py-1.5
                transition-all duration-200">

      <button onclick={handleMediaUpload} aria-label="Add media"
        class="w-11 h-11 rounded-full active:scale-95 transition-all duration-200
               flex items-center justify-center text-xl"
        style="color: var(--text-tertiary);">
        +
      </button>

      <textarea
        bind:this={textareaEl}
        bind:value={message}
        oninput={emitTyping}
        onkeydown={handleKeydown}
        placeholder="Message..."
        rows="1"
        class="flex-1 resize-none bg-transparent outline-none max-h-32
               text-[15px] leading-snug py-2 px-1"
        style="color: var(--text-primary);"
      ></textarea>

      <button onclick={() => { isTrayOpen = !isTrayOpen; isEmojiOpen = false; }}
        class="active:scale-95 transition-all duration-200
               px-1.5 h-11 flex items-center justify-center rounded-full
               text-[11px] font-bold tracking-wide"
        style="color: {isTrayOpen ? 'var(--color-primary)' : 'var(--text-tertiary)'};">
        GIF
      </button>

      <button onclick={() => { isEmojiOpen = !isEmojiOpen; isTrayOpen = false; }}
        class="active:scale-95 transition-all duration-200
               w-11 h-11 flex items-center justify-center rounded-full text-lg"
        style="color: {isEmojiOpen ? 'var(--color-primary)' : 'var(--text-tertiary)'};">
        😊
      </button>

      {#if hasText}
        <button onclick={handleSend}
          class="bg-red-600 rounded-full w-11 h-11 flex items-center justify-center
                 text-white active:scale-95 transition-all duration-200
                 shadow-[0_2px_10px_rgba(220,38,38,0.35)]">
          ➤
        </button>
      {:else}
        <button
          onclick={handleVoiceRecord}
          class:animate-pulse={isRecording}
          class="w-11 h-11 rounded-full active:scale-95 transition-all duration-200
                 flex items-center justify-center text-lg"
          style="color: var(--text-tertiary);">
          🎤
        </button>
      {/if}

    </div>
  </div>
{/if}