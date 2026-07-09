<script lang="ts">
  import { X, ChevronLeft, ChevronRight, Download } from 'lucide-svelte';

  interface Props {
    images: Array<{ url: string; caption?: string }>;
    initialIndex?: number;
    onClose: () => void;
  }

  let { images, initialIndex = 0, onClose }: Props = $props();

  let currentIndex = $state(0);
  $effect(() => { currentIndex = initialIndex; });
  let isZoomed = $state(false);
  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let containerEl: HTMLDivElement | undefined = $state();

  let currentImage = $derived(images[currentIndex] ?? images[0]);
  let hasMultiple = $derived(images.length > 1);

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
    isZoomed = false;
  }

  function toggleZoom() {
    if (isZoomed) {
      resetZoom();
    } else {
      scale = 2.5;
      isZoomed = true;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
  }

  async function handleDownload() {
    try {
      const response = await fetch(currentImage.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(currentImage.url, '_blank');
    }
  }

  // Swipe gesture for mobile
  let touchStartX = 0;
  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
  }

  function handleTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 60) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

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
  class="fixed inset-0 z-[100] flex flex-col animate-fade-in"
  style="background: rgba(0, 0, 0, 0.95);"
  onkeydown={handleKeydown}
  role="dialog"
  tabindex="0"
>
  <!-- Top bar -->
  <div class="flex items-center justify-between px-3 safe-top" style="height: 56px; min-height: 56px;">
    <button
      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all duration-200 active:scale-90"
      style="background: rgba(255, 255, 255, 0.12); color: white;"
      onclick={onClose}
      aria-label="Close"
    >
      <X size={22} />
    </button>

    <div class="flex items-center gap-2">
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all duration-200 active:scale-90"
        style="background: rgba(255, 255, 255, 0.12); color: white;"
        onclick={handleDownload}
        aria-label="Download image"
      >
        <Download size={20} />
      </button>
    </div>
  </div>

  <!-- Image container -->
  <div
    class="flex-1 flex items-center justify-center overflow-hidden relative"
    bind:this={containerEl}
    onclick={toggleZoom}
    ontouchstart={handleTouchStart}
    ontouchend={handleTouchEnd}
    role="button"
    tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleZoom(); }}
  >
    <!-- Nav arrows (desktop) -->
    {#if hasMultiple}
      <button
        class="absolute left-2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 hidden md:flex"
        style="background: rgba(255, 255, 255, 0.12); color: white;"
        onclick={(e) => { e.stopPropagation(); goPrev(); }}
        aria-label="Previous image"
      >
        <ChevronLeft size={28} />
      </button>
      <button
        class="absolute right-2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 hidden md:flex"
        style="background: rgba(255, 255, 255, 0.12); color: white;"
        onclick={(e) => { e.stopPropagation(); goNext(); }}
        aria-label="Next image"
      >
        <ChevronRight size={28} />
      </button>
    {/if}

    <img
      src={currentImage.url}
      alt={currentImage.caption || 'Chat image'}
      class="max-w-full max-h-full object-contain transition-transform duration-300 select-none"
      style="transform: scale({scale}) translate({translateX}px, {translateY}px);"
      draggable="false"
    />
  </div>

  <!-- Bottom info -->
  <div class="px-4 pb-4 safe-bottom">
    {#if currentImage?.caption}
      <p class="text-white/80 text-sm text-center">{currentImage.caption}</p>
    {/if}
    {#if hasMultiple}
      <p class="text-white/50 text-xs text-center mt-2">{currentIndex + 1} / {images.length}</p>
    {/if}
  </div>
</div>