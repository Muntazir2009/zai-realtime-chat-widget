<script lang="ts">
  import { Loader2 } from 'lucide-svelte';
  import VoiceRecorder from '$lib/components/media/VoiceRecorder.svelte';
  import StickerPicker from '$lib/components/pickers/StickerPicker.svelte';
  import GIFPicker from '$lib/components/pickers/GIFPicker.svelte';
  import { presenceManager } from '$lib/managers/PresenceManager.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { uploadFile } from '$lib/firebase/storage';

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

  let hasText = $derived(message.trim().length > 0);

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

  // ── Sticker ──
  function handleSticker(sticker: string) {
    isTrayOpen = false;
    onStickerSelect?.(sticker);
  }

  // ── GIF ──
  function handleGif(gifUrl: string) {
    isGifOpen = false;
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
    {#if isTrayOpen}
      <StickerPicker onStickerSelect={handleSticker} />
    {:else if isGifOpen}
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

      <button onclick={() => { isTrayOpen = !isTrayOpen; isGifOpen = false; }}
        class="active:scale-95 transition-all duration-200
               px-1.5 h-11 flex items-center justify-center rounded-full
               text-[11px] font-bold tracking-wide"
        style="color: {isTrayOpen ? 'var(--color-primary)' : 'var(--text-tertiary)'};">
        GIF
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
          class="w-11 h-11 rounded-full active:scale-95 transition-all duration-200
                 flex items-center justify-center text-lg"
          style="color: var(--text-tertiary);">
          🎤
        </button>
      {/if}

    </div>
  </div>
{/if}