<script lang="ts">
  import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, RotateCw, Info } from 'lucide-svelte';

  interface Props {
    images: Array<{ url: string; caption?: string; isGif?: boolean }>;
    initialIndex?: number;
    onClose: () => void;
  }

  let { images, initialIndex = 0, onClose }: Props = $props();

  let currentIndex = $state(0);
  $effect(() => { currentIndex = initialIndex; });
  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let containerEl: HTMLDivElement | undefined = $state();
  let showInfo = $state(false);

  let currentImage = $derived(images[currentIndex] ?? images[0]);
  let hasMultiple = $derived(images.length > 1);
  let isZoomed = $derived(scale > 1.05);

  function goNext() {
    if (currentIndex < images.length - 1) {
      currentIndex++;
      resetZoom();
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      currentIndex--;
      resetZoom();
    }
  }

  function resetZoom() {
    scale = 1;
    translateX = 0;
    translateY = 0;
  }

  function zoomIn() {
    scale = Math.min(scale + 0.5, 5);
  }

  function zoomOut() {
    scale = Math.max(scale - 0.5, 0.5);
  }

  function toggleZoom() {
    if (isZoomed) {
      resetZoom();
    } else {
      scale = 2.5;
    }
  }

  // Double-tap to zoom
  let lastTap = 0;
  function handleContainerClick(e: MouseEvent | TouchEvent) {
    const now = Date.now();
    if (now - lastTap < 300) {
      toggleZoom();
    }
    lastTap = now;
  }

  // Pinch zoom
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartScale = scale;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 2 && pinchStartDist > 0) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      scale = Math.max(0.5, Math.min(5, pinchStartScale * (dist / pinchStartDist)));
    } else if (e.touches.length === 1 && isZoomed) {
      // Pan when zoomed
      e.preventDefault();
      // Handled by CSS touch-action
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0 && pinchStartDist > 0) {
      pinchStartDist = 0;
      return;
    }
    // Swipe to navigate (only when not zoomed)
    if (!isZoomed && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - (e.touches[0]?.clientX ?? 0);
      // This is a simplified check; real swipe needs touchstart X stored
    }
  }

  // Track touch start X for swipe
  let touchStartX = 0;
  function handleSwipeTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    if (e.touches.length === 2) {
      handleTouchStart(e);
    }
  }
  function handleSwipeTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
      handleTouchMove(e);
    }
  }
  function handleSwipeTouchEnd(e: TouchEvent) {
    if (pinchStartDist > 0) {
      handleTouchEnd(e);
      return;
    }
    if (!isZoomed && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 60) {
        if (dx < 0) goNext();
        else goPrev();
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-') zoomOut();
    if (e.key === '0') resetZoom();
    if (e.key === 'i') showInfo = !showInfo;
  }

  async function handleDownload() {
    try {
      const response = await fetch(currentImage.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = currentImage.isGif ? 'gif' : 'jpg';
      a.download = `chat-${currentIndex + 1}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(currentImage.url, '_blank');
    }
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ url: currentImage.url, title: currentImage.caption || 'Chat Image' }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(currentImage.url).then(() => {
        shareCopied = true;
        setTimeout(() => shareCopied = false, 1500);
      });
    }
  }

  let shareCopied = $state(false);

  $effect(() => {
    document.addEventListener('keydown', handleKeydown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = '';
    };
  });
</script>

<div
  class="lb-backdrop"
  onkeydown={handleKeydown}
  role="dialog"
  tabindex="0"
>
  <!-- Top bar -->
  <div class="lb-top">
    <button class="lb-btn" onclick={onClose} aria-label="Close">
      <X size={22} />
    </button>

    <div class="lb-top-center">
      {#if hasMultiple}
        <span class="lb-counter">{currentIndex + 1} / {images.length}</span>
      {/if}
    </div>

    <div class="lb-top-actions">
      {#if currentImage?.isGif}
        <span class="lb-gif-badge">GIF</span>
      {/if}
      <button class="lb-btn" onclick={handleShare} aria-label="Share">
        {#if shareCopied}
          <span class="lb-copied">Copied!</span>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        {/if}
      </button>
      <button class="lb-btn" onclick={handleDownload} aria-label="Download">
        <Download size={20} />
      </button>
    </div>
  </div>

  <!-- Image container -->
  <div
    class="lb-img-area"
    class:lb-img-area-zoomed={isZoomed}
    bind:this={containerEl}
    onclick={handleContainerClick}
    ontouchstart={handleSwipeTouchStart}
    ontouchmove={handleSwipeTouchMove}
    ontouchend={handleSwipeTouchEnd}
    role="button"
    tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleZoom(); }}
  >
    <!-- Nav arrows (desktop) -->
    {#if hasMultiple}
      <button
        class="lb-nav lb-nav-left"
        onclick={(e) => { e.stopPropagation(); goPrev(); }}
        aria-label="Previous"
      >
        <ChevronLeft size={28} />
      </button>
      <button
        class="lb-nav lb-nav-right"
        onclick={(e) => { e.stopPropagation(); goNext(); }}
        aria-label="Next"
      >
        <ChevronRight size={28} />
      </button>
    {/if}

    {#if currentImage?.isGif}
      <img
        src={currentImage.url}
        alt={currentImage.caption || 'GIF'}
        class="lb-media"
        style="transform: scale({scale}) translate({translateX}px, {translateY}px);"
        draggable="false"
      />
    {:else}
      <img
        src={currentImage.url}
        alt={currentImage.caption || 'Chat image'}
        class="lb-media"
        style="transform: scale({scale}) translate({translateX}px, {translateY}px);"
        draggable="false"
        loading="eager"
      />
    {/if}
  </div>

  <!-- Bottom controls -->
  <div class="lb-bottom safe-bottom">
    <!-- Caption -->
    {#if currentImage?.caption}
      <p class="lb-caption">{currentImage.caption}</p>
    {/if}

    <!-- Zoom controls + info -->
    <div class="lb-controls">
      <div class="lb-zoom-controls">
        <button class="lb-ctrl-btn" onclick={zoomOut} aria-label="Zoom out" class:lb-ctrl-disabled={scale <= 0.5}>
          <ZoomOut size={18} />
        </button>
        <span class="lb-zoom-label">{Math.round(scale * 100)}%</span>
        <button class="lb-ctrl-btn" onclick={zoomIn} aria-label="Zoom in" class:lb-ctrl-disabled={scale >= 5}>
          <ZoomIn size={18} />
        </button>
        {#if isZoomed}
          <button class="lb-ctrl-btn" onclick={resetZoom} aria-label="Reset zoom">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
          </button>
        {/if}
      </div>

      {#if hasMultiple}
        <!-- Dot indicators -->
        <div class="lb-dots">
          {#each images as _, i}
            <span class="lb-dot" class:lb-dot-active={i === currentIndex}></span>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .lb-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    background: rgba(0, 0, 0, 0.95);
    animation: lbFadeIn 200ms ease both;
    user-select: none;
    -webkit-user-select: none;
  }

  @keyframes lbFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Top bar */
  .lb-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    height: 56px;
    min-height: 56px;
    flex-shrink: 0;
  }

  .lb-btn {
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: white;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }
  .lb-btn:active { transform: scale(0.88); background: rgba(255,255,255,0.2); }

  .lb-top-center {
    display: flex;
    align-items: center;
  }

  .lb-counter {
    color: rgba(255,255,255,0.7);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .lb-top-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .lb-gif-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(255,255,255,0.15);
    color: white;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  .lb-copied {
    font-size: 12px;
    font-weight: 600;
    color: white;
  }

  /* Image area */
  .lb-img-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    touch-action: pan-x pan-y pinch-zoom;
    cursor: zoom-in;
  }

  .lb-img-area-zoomed {
    cursor: grab;
  }

  .lb-media {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
  }

  /* Nav arrows */
  .lb-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    display: none;
  }

  @media (min-width: 768px) {
    .lb-nav { display: flex; }
  }

  .lb-nav-left { left: 12px; }
  .lb-nav-right { right: 12px; }

  /* Bottom */
  .lb-bottom {
    padding: 8px 16px 12px;
    flex-shrink: 0;
  }

  .lb-caption {
    color: rgba(255,255,255,0.8);
    font-size: 14px;
    text-align: center;
    margin: 0 0 8px;
    max-width: 80%;
    margin-left: auto;
    margin-right: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lb-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .lb-zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 24px;
    padding: 3px;
  }

  .lb-ctrl-btn {
    min-width: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: white;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }
  .lb-ctrl-btn:active { transform: scale(0.88); background: rgba(255,255,255,0.15); }
  .lb-ctrl-disabled { opacity: 0.3; pointer-events: none; }

  .lb-zoom-label {
    min-width: 42px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.7);
    font-variant-numeric: tabular-nums;
  }

  /* Dots */
  .lb-dots {
    display: flex;
    gap: 6px;
  }

  .lb-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.3);
    transition: background 200ms ease, transform 200ms ease;
  }

  .lb-dot-active {
    background: white;
    transform: scale(1.3);
  }
</style>