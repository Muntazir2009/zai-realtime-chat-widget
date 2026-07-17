<script lang="ts">
  import { X, Send, Plus, Volume2, VolumeX, Play, Pause } from 'lucide-svelte';

  // ── Types ──
  export interface MediaComposerFile {
    file: File;
    objectUrl: string;
    type: 'image' | 'video';
    width?: number;
    height?: number;
    duration?: number;
    thumbnailUrl?: string;
  }

  interface Props {
    files: MediaComposerFile[];
    onClose: () => void;
    onSend: (files: MediaComposerFile[], caption: string) => void;
    onAddMore: () => void;
    onRemoveFile: (index: number) => void;
  }

  let { files, onClose, onSend, onAddMore, onRemoveFile }: Props = $props();

  // ── State ──
  let currentIndex = $state(0);
  let caption = $state('');
  let isExiting = $state(false);
  let isMounted = $state(false);

  // Video state
  let videoEl: HTMLVideoElement | null = $state(null);
  let isPlaying = $state(false);
  let isMuted = $state(true);
  let currentTime = $state(0);
  let videoDuration = $state(0);
  let isSeeking = $state(false);
  let seekProgress = $state(0);

  // Image zoom state
  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);

  // Touch gesture state
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let lastTapTime = 0;
  let panStartX = 0;
  let panStartY = 0;
  let panStartTx = 0;
  let panStartTy = 0;
  let isPanning = $state(false);
  let isPinching = false;
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let swipeDeltaX = $state(0);

  // Mouse state (desktop)
  let mouseDown = $state(false);
  let mouseStartX = 0;
  let mouseStartY = 0;
  let mousePanStartTx = 0;
  let mousePanStartTy = 0;

  let previewContainerEl: HTMLDivElement | null = $state(null);
  let captionEl: HTMLTextAreaElement | null = $state(null);

  // ── Derived ──
  let currentFile = $derived(files[currentIndex] ?? null);
  let hasMultiple = $derived(files.length > 1);
  let isZoomed = $derived(scale > 1.05);
  let isImage = $derived(currentFile?.type === 'image');
  let isVideo = $derived(currentFile?.type === 'video');

  // ── Lifecycle ──
  $effect(() => {
    // Trigger mount animation
    requestAnimationFrame(() => { isMounted = true; });
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  });

  // Pause video when navigating away or component closes
  $effect(() => {
    if (currentFile?.type !== 'video' && videoEl) {
      videoEl.pause();
      isPlaying = false;
    }
  });

  // Sync seek bar with video time
  $effect(() => {
    if (videoEl && !isSeeking) {
      seekProgress = videoDuration > 0 ? (videoEl.currentTime / videoDuration) * 100 : 0;
    }
  });

  // Reset zoom when index changes
  $effect(() => {
    // Read currentIndex to track dependency
    const idx = currentIndex;
    resetZoom();
    swipeDeltaX = 0;
    // Pause previous video if switching away
    if (videoEl) {
      videoEl.pause();
      isPlaying = false;
    }
  });

  // ── File size formatting ──
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  // ── Duration formatting ──
  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Navigation ──
  function goNext() {
    if (currentIndex < files.length - 1) {
      currentIndex++;
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      currentIndex--;
    }
  }

  // ── Zoom ──
  function resetZoom() {
    scale = 1;
    translateX = 0;
    translateY = 0;
  }

  function toggleZoom() {
    if (isZoomed) {
      resetZoom();
    } else {
      scale = 2.5;
    }
  }

  // ── Touch handlers ──
  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      panStartX = e.touches[0].clientX;
      panStartY = e.touches[0].clientY;
      panStartTx = translateX;
      panStartTy = translateY;
    } else if (e.touches.length === 2) {
      isPinching = true;
      isPanning = false;
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartScale = scale;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 2 && isPinching) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const newScale = Math.max(0.5, Math.min(5, pinchStartScale * (dist / Math.max(pinchStartDist, 1))));
      const containerRect = previewContainerEl?.getBoundingClientRect();
      if (containerRect) {
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const px = (cx - containerRect.left - containerRect.width / 2) / containerRect.width;
        const py = (cy - containerRect.top - containerRect.height / 2) / containerRect.height;
        const ratio = newScale / scale;
        translateX = px * containerRect.width * (1 - ratio);
        translateY = py * containerRect.height * (1 - ratio);
      }
      scale = newScale;
    } else if (e.touches.length === 1 && isImage) {
      if (isZoomed && !isPinching) {
        e.preventDefault();
        isPanning = true;
        const dx = e.touches[0].clientX - panStartX;
        const dy = e.touches[0].clientY - panStartY;
        translateX = panStartTx + dx;
        translateY = panStartTy + dy;
      } else if (!isZoomed && !isPinching && hasMultiple) {
        // Swipe preview
        const dx = e.touches[0].clientX - touchStartX;
        if (Math.abs(dx) > 10) {
          e.preventDefault();
          swipeDeltaX = dx;
        }
      }
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      const now = Date.now();

      // Double-tap detection
      if (now - lastTapTime < 300 && !isPanning && !isPinching && isImage) {
        toggleZoom();
        swipeDeltaX = 0;
      }
      lastTapTime = now;

      // Swipe detection (only when not zoomed, not panning, and is image)
      if (!isZoomed && !isPanning && !isPinching && isImage && hasMultiple) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dt = Date.now() - touchStartTime;
        if (Math.abs(swipeDeltaX) > 60 && dt < 400) {
          if (swipeDeltaX < 0) goNext();
          else goPrev();
        }
      }

      // Snap back if over-panned
      if (isPanning) {
        const maxPan = (scale - 1) * 150;
        translateX = Math.max(-maxPan, Math.min(maxPan, translateX));
        translateY = Math.max(-maxPan, Math.min(maxPan, translateY));
      }

      swipeDeltaX = 0;
      isPanning = false;
      isPinching = false;
      pinchStartDist = 0;
    }
  }

  // ── Mouse drag (desktop zoom pan) ──
  function handleMouseDown(e: MouseEvent) {
    if (!isZoomed || !isImage) return;
    mouseDown = true;
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    mousePanStartTx = translateX;
    mousePanStartTy = translateY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!mouseDown || !isZoomed) return;
    translateX = mousePanStartTx + (e.clientX - mouseStartX);
    translateY = mousePanStartTy + (e.clientY - mouseStartY);
  }

  function handleMouseUp() {
    if (!mouseDown) return;
    mouseDown = false;
    if (isZoomed) {
      const maxPan = (scale - 1) * 150;
      translateX = Math.max(-maxPan, Math.min(maxPan, translateX));
      translateY = Math.max(-maxPan, Math.min(maxPan, translateY));
    }
  }

  $effect(() => {
    const onUp = () => handleMouseUp();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  });

  // ── Video controls ──
  function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
      isPlaying = true;
    } else {
      videoEl.pause();
      isPlaying = false;
    }
  }

  function toggleMute() {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    isMuted = videoEl.muted;
  }

  function handleVideoTimeUpdate() {
    if (!videoEl || isSeeking) return;
    currentTime = videoEl.currentTime;
  }

  function handleVideoLoadedMetadata() {
    if (!videoEl) return;
    videoDuration = videoEl.duration;
    if (isMuted) videoEl.muted = true;
  }

  function handleVideoEnded() {
    isPlaying = false;
  }

  function handleSeekStart() {
    isSeeking = true;
  }

  function handleSeekMove(e: Event) {
    if (!isSeeking) return;
    const input = e.target as HTMLInputElement;
    seekProgress = parseFloat(input.value);
  }

  function handleSeekEnd(e: Event) {
    if (!videoEl) return;
    const input = e.target as HTMLInputElement;
    const pct = parseFloat(input.value);
    videoEl.currentTime = (pct / 100) * videoDuration;
    seekProgress = pct;
    isSeeking = false;
  }

  // ── Actions ──
  function handleSend() {
    if (files.length === 0) return;
    onSend(files, caption.trim());
  }

  function handleRemoveFile(index: number, e: MouseEvent) {
    e.stopPropagation();
    onRemoveFile(index);
  }

  function handleClose() {
    // Pause video before exiting
    if (videoEl) {
      videoEl.pause();
      isPlaying = false;
    }
    isExiting = true;
    setTimeout(() => {
      onClose();
    }, 250);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  $effect(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });

  // ── Caption auto-resize ──
  $effect(() => {
    const text = caption; // track dependency
    if (captionEl) {
      captionEl.style.height = 'auto';
      captionEl.style.height = Math.min(captionEl.scrollHeight, 80) + 'px';
    }
  });
</script>

<!-- Backdrop -->
<div
  class="mc-backdrop"
  class:mc-backdrop-mounted={isMounted}
  class:mc-backdrop-exiting={isExiting}
>
  <!-- Main panel -->
  <div class="mc-panel" class:mc-panel-mounted={isMounted} class:mc-panel-exiting={isExiting}>

    <!-- Top bar -->
    <div class="mc-top safe-top">
      <button class="mc-close-btn" onclick={handleClose} aria-label="Close">
        <X size={22} />
      </button>
      <div class="mc-top-center">
        {#if hasMultiple}
          <span class="mc-counter">{currentIndex + 1} / {files.length}</span>
        {/if}
      </div>
      <div class="mc-top-spacer"></div>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- Preview area -->
    <div
      class="mc-preview"
      bind:this={previewContainerEl}
      ontouchstart={isImage ? handleTouchStart : undefined}
      ontouchmove={isImage ? handleTouchMove : undefined}
      ontouchend={isImage ? handleTouchEnd : undefined}
      onmousedown={isImage ? handleMouseDown : undefined}
      onmousemove={isImage ? handleMouseMove : undefined}
      ondblclick={isImage ? toggleZoom : undefined}
      role="application"
      aria-label={currentFile ? `Preview of ${currentFile.file.name}` : 'Media preview'}
    >
      {#if currentFile}
        {#if currentFile.type === 'image'}
          <!-- Image preview -->
          <img
            src={currentFile.objectUrl}
            alt={currentFile.file.name}
            class="mc-media"
            draggable="false"
            style="transform: translate({swipeDeltaX}px, 0) scale({scale}) translate({translateX / scale}px, {translateY / scale}px); transition: {(isPanning || mouseDown || Math.abs(swipeDeltaX) > 10) ? 'none' : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'};"
          />
        {:else}
          <!-- Video preview -->
          <div class="mc-video-wrapper" onclick={togglePlay} role="button" tabindex="0" aria-label="Play or pause video" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePlay(); } }}>
            <video
              bind:this={videoEl}
              src={currentFile.objectUrl}
              poster={currentFile.thumbnailUrl}
              preload="metadata"
              playsinline
              ontimeupdate={handleVideoTimeUpdate}
              onloadedmetadata={handleVideoLoadedMetadata}
              onended={handleVideoEnded}
              onplay={() => isPlaying = true}
              onpause={() => isPlaying = false}
              class="mc-video"
            >
              <track kind="captions" />
            </video>

            <!-- Play/Pause overlay -->
            {#if !isPlaying}
              <div class="mc-play-overlay">
                <div class="mc-play-btn">
                  <Play size={36} fill="white" color="white" />
                </div>
              </div>
            {/if}
          </div>

          <!-- Video seek bar -->
          <div class="mc-seek-bar-container">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={seekProgress}
              onmousedown={handleSeekStart}
              ontouchstart={handleSeekStart}
              oninput={handleSeekMove}
              onchange={handleSeekEnd}
              class="mc-seek-bar"
            />
          </div>

          <!-- Video controls row -->
          <div class="mc-video-controls">
            <span class="mc-time">{formatDuration(currentTime)}</span>
            <button class="mc-ctrl-btn" onclick={(e) => { e.stopPropagation(); togglePlay(); }} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {#if isPlaying}
                <Pause size={18} fill="currentColor" />
              {:else}
                <Play size={18} fill="currentColor" />
              {/if}
            </button>
            <span class="mc-time">{formatDuration(videoDuration || currentFile.duration || 0)}</span>
            <button class="mc-ctrl-btn" onclick={(e) => { e.stopPropagation(); toggleMute(); }} aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {#if isMuted}
                <VolumeX size={18} />
              {:else}
                <Volume2 size={18} />
              {/if}
            </button>
          </div>
        {/if}
      {/if}

      <!-- Empty state -->
      {#if files.length === 0}
        <div class="mc-empty">
          <span>No files selected</span>
        </div>
      {/if}

      <!-- Dot indicators for multiple images -->
      {#if hasMultiple && isImage}
        <div class="mc-dots">
          {#each files as _, i}
            <span class="mc-dot" class:mc-dot-active={i === currentIndex}></span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- File info bar -->
    {#if currentFile}
      <div class="mc-info-bar">
        <div class="mc-info-left">
          <span class="mc-filename" title={currentFile.file.name}>{currentFile.file.name}</span>
        </div>
        <div class="mc-info-right">
          <span class="mc-info-tag">{formatFileSize(currentFile.file.size)}</span>
          {#if currentFile.width && currentFile.height}
            <span class="mc-info-tag">{currentFile.width}&times;{currentFile.height}</span>
          {/if}
          {#if currentFile.type === 'video' && currentFile.duration}
            <span class="mc-info-tag">{formatDuration(currentFile.duration)}</span>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Thumbnail strip -->
    {#if hasMultiple}
      <div class="mc-thumbnails">
        {#each files as f, i}
          <div
            class="mc-thumb"
            class:mc-thumb-active={i === currentIndex}
            onclick={() => { currentIndex = i; }}
            role="button"
            tabindex="0"
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); currentIndex = i; } }}
          >
            {#if f.type === 'image'}
              <img src={f.objectUrl} alt={f.file.name} draggable="false" />
            {:else}
              <img src={f.thumbnailUrl || f.objectUrl} alt={f.file.name} draggable="false" />
              <span class="mc-thumb-duration">{formatDuration(f.duration || 0)}</span>
            {/if}
            <button
              class="mc-thumb-remove"
              onclick={(e) => handleRemoveFile(i, e)}
              aria-label="Remove file"
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Caption input -->
    <div class="mc-caption-area">
      <textarea
        bind:this={captionEl}
        bind:value={caption}
        placeholder="Add a caption..."
        rows="1"
        class="mc-caption-input"
      ></textarea>
    </div>

    <!-- Bottom action bar -->
    <div class="mc-actions safe-bottom">
      <button class="mc-action-btn mc-action-add" onclick={onAddMore} aria-label="Add more files">
        <Plus size={20} />
      </button>
      <button class="mc-action-btn mc-action-cancel" onclick={handleClose} aria-label="Cancel">
        Cancel
      </button>
      <button
        class="mc-action-btn mc-action-send"
        class:mc-action-send-disabled={files.length === 0}
        onclick={handleSend}
        aria-label="Send"
      >
        <Send size={18} />
        <span class="mc-send-label">Send</span>
      </button>
    </div>
  </div>
</div>

<style>
  /* ── Backdrop ── */
  .mc-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    opacity: 0;
    transition: opacity 250ms ease;
    user-select: none;
    -webkit-user-select: none;
  }

  .mc-backdrop-mounted {
    opacity: 1;
  }

  .mc-backdrop-exiting {
    opacity: 0 !important;
    transition: opacity 200ms ease !important;
  }

  /* ── Panel ── */
  .mc-panel {
    width: 100%;
    max-width: 520px;
    max-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border: 1px solid var(--glass-border);
    border-bottom: none;
    overflow: hidden;
    transform: translateY(100%);
    opacity: 0;
    animation: composerSlideUp 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .mc-panel-exiting {
    animation: composerSlideDown 250ms cubic-bezier(0.4, 0, 1, 1) forwards !important;
  }

  @keyframes composerSlideUp {
    from { transform: translateY(100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  @keyframes composerSlideDown {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(100%); opacity: 0; }
  }

  @media (min-width: 640px) {
    .mc-panel {
      border-radius: var(--radius-lg);
      max-height: 92vh;
      margin-bottom: 4vh;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
    }
  }

  /* ── Top bar ── */
  .mc-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 8px 4px;
    flex-shrink: 0;
    min-height: 48px;
  }

  .mc-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    color: var(--text-primary);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }

  .mc-close-btn:active {
    transform: scale(0.88);
  }

  .mc-top-center {
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: center;
  }

  .mc-counter {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    padding: 4px 12px;
    border-radius: var(--radius-pill);
  }

  .mc-top-spacer {
    width: 40px;
    min-width: 40px;
  }

  /* ── Preview area ── */
  .mc-preview {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    background: var(--bg-page);
    touch-action: none;
    cursor: zoom-in;
  }

  .mc-media {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    pointer-events: none;
    will-change: transform;
  }

  /* ── Video ── */
  .mc-video-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .mc-video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    background: #000;
  }

  .mc-play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.2);
    transition: opacity 200ms ease;
  }

  .mc-play-btn {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .mc-play-btn:active {
    transform: scale(0.88);
  }

  /* Seek bar */
  .mc-seek-bar-container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0 12px;
    z-index: 5;
  }

  .mc-seek-bar {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.2);
    outline: none;
    cursor: pointer;
    transition: height 150ms ease;
  }

  .mc-seek-bar:hover {
    height: 6px;
  }

  .mc-seek-bar::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    cursor: pointer;
  }

  .mc-seek-bar::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    border: none;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    cursor: pointer;
  }

  /* Video controls */
  .mc-video-controls {
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 6;
    pointer-events: none;
  }

  .mc-video-controls > * {
    pointer-events: auto;
  }

  .mc-time {
    font-size: 11px;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    font-variant-numeric: tabular-nums;
    min-width: 32px;
  }

  .mc-ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: white;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }

  .mc-ctrl-btn:active {
    transform: scale(0.88);
    background: rgba(0, 0, 0, 0.6);
  }

  /* ── Empty state ── */
  .mc-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--text-tertiary);
    font-size: 14px;
  }

  /* ── Dot indicators ── */
  .mc-dots {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
    z-index: 5;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .mc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);
    transition: background 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .mc-dot-active {
    background: white;
    transform: scale(1.4);
  }

  /* ── File info bar ── */
  .mc-info-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    gap: 8px;
    flex-shrink: 0;
    border-top: 1px solid var(--border-subtle);
  }

  .mc-info-left {
    flex: 1;
    min-width: 0;
  }

  .mc-filename {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mc-info-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .mc-info-tag {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
    background: var(--bg-elevated);
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    white-space: nowrap;
  }

  /* ── Thumbnail strip ── */
  .mc-thumbnails {
    display: flex;
    gap: 8px;
    padding: 8px 16px;
    overflow-x: auto;
    flex-shrink: 0;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .mc-thumbnails::-webkit-scrollbar {
    display: none;
  }

  .mc-thumb {
    position: relative;
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 2px solid transparent;
    background: var(--bg-elevated);
    cursor: pointer;
    padding: 0;
    outline: none;
    scroll-snap-align: start;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .mc-thumb:active {
    transform: scale(0.92);
  }

  .mc-thumb:focus-visible {
    box-shadow: 0 0 0 2px var(--color-primary);
  }

  .mc-thumb-active {
    border-color: var(--color-primary);
  }

  .mc-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
  }

  .mc-thumb-duration {
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 9px;
    font-weight: 700;
    color: white;
    background: rgba(0, 0, 0, 0.6);
    padding: 1px 4px;
    border-radius: 4px;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .mc-thumb-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    opacity: 0;
    transition: opacity 200ms ease, transform 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .mc-thumb:hover .mc-thumb-remove,
  .mc-thumb-active .mc-thumb-remove {
    opacity: 1;
  }

  .mc-thumb-remove:active {
    transform: scale(0.85);
  }

  /* ── Caption area ── */
  .mc-caption-area {
    padding: 4px 16px;
    flex-shrink: 0;
  }

  .mc-caption-input {
    width: 100%;
    resize: none;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    font-size: 15px;
    line-height: 1.45;
    color: var(--text-primary);
    font-family: var(--font-sans, inherit);
    outline: none;
    max-height: 80px;
    min-height: 40px;
    transition: border-color 200ms ease, box-shadow 200ms ease;
    box-sizing: border-box;
  }

  .mc-caption-input::placeholder {
    color: var(--text-tertiary);
  }

  .mc-caption-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
  }

  /* ── Bottom actions ── */
  .mc-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px 12px;
    flex-shrink: 0;
  }

  .mc-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 44px;
    min-height: 44px;
    border-radius: var(--radius-md);
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
                background 150ms ease,
                box-shadow 200ms ease,
                opacity 200ms ease;
    font-family: var(--font-sans, inherit);
  }

  .mc-action-btn:active {
    transform: scale(0.94);
  }

  .mc-action-add {
    width: 44px;
    min-width: 44px;
    padding: 0;
    background: var(--bg-elevated);
    color: var(--text-primary);
    border: 1px solid var(--border-subtle);
  }

  .mc-action-add:hover {
    background: color-mix(in srgb, var(--bg-elevated) 80%, var(--color-primary));
  }

  .mc-action-cancel {
    padding: 0 20px;
    background: transparent;
    color: var(--color-danger, #ef4444);
    border: 1px solid color-mix(in srgb, var(--color-danger, #ef4444) 25%, transparent);
  }

  .mc-action-cancel:hover {
    background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
  }

  .mc-action-send {
    flex: 1;
    padding: 0 24px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 90%, white), var(--color-primary));
    color: var(--color-primary-foreground);
    box-shadow:
      0 2px 4px color-mix(in srgb, black 15%, transparent),
      0 4px 12px color-mix(in srgb, var(--color-primary) 35%, transparent),
      inset 0 1px 0 color-mix(in srgb, white 25%, transparent);
  }

  .mc-action-send:hover {
    box-shadow:
      0 2px 4px color-mix(in srgb, black 15%, transparent),
      0 6px 20px color-mix(in srgb, var(--color-primary) 45%, transparent),
      inset 0 1px 0 color-mix(in srgb, white 25%, transparent);
  }

  .mc-action-send-disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .mc-send-label {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
</style>