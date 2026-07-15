<script lang="ts">
  import { X, ChevronLeft, ChevronRight } from 'lucide-svelte';

  interface MediaItem {
    url: string;
    type: 'image' | 'video';
    id?: string;
  }

  interface Props {
    items: MediaItem[];
    onClose: () => void;
  }

  let { items, onClose }: Props = $props();

  let selectedIndex = $state(0);
  let showViewer = $state(false);

  const currentItem = $derived(items[selectedIndex]);
  const hasPrev = $derived(selectedIndex > 0);
  const hasNext = $derived(selectedIndex < items.length - 1);

  function openViewer(index: number) {
    selectedIndex = index;
    showViewer = true;
  }

  function closeViewer() {
    showViewer = false;
  }

  function prevItem() {
    if (hasPrev) selectedIndex--;
  }

  function nextItem() {
    if (hasNext) selectedIndex++;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showViewer) closeViewer();
      else onClose();
    } else if (e.key === 'ArrowLeft' && showViewer) {
      prevItem();
    } else if (e.key === 'ArrowRight' && showViewer) {
      nextItem();
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

<!-- Gallery Grid -->
<div class="fixed inset-0 z-50 glass animate-fade-in" style="background: var(--bg-page);">
  <!-- Header -->
  <div class="glass-header safe-top flex items-center px-4" style="height: calc(56px + env(safe-area-inset-top, 0px));">
    <div class="h-[56px] flex items-center justify-between w-full">
      <div class="min-w-[44px]"></div>
      <h2 class="font-semibold text-base" style="color: var(--text-primary);">Media</h2>
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-95"
        style="color: var(--text-secondary);"
        onclick={onClose}
        aria-label="Close gallery"
      >
        <X size={22} />
      </button>
    </div>
  </div>

  <!-- Grid -->
  <div class="p-4 pt-2 overflow-y-auto custom-scrollbar" style="height: calc(100vh - 56px - env(safe-area-inset-top, 0px));">
    {#if items.length === 0}
      <div class="flex flex-col items-center justify-center py-16" style="color: var(--text-tertiary);">
        <p class="text-sm">No media yet</p>
      </div>
    {:else}
      <div class="grid grid-cols-3 gap-1.5">
        {#each items as item, i}
          <button
            class="aspect-square rounded-[var(--radius-sm)] overflow-hidden transition-spring active:scale-95"
            onclick={() => openViewer(i)}
            aria-label="View media {i + 1}"
          >
            <img
              src={item.url}
              alt=""
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Full-screen Viewer -->
{#if showViewer && currentItem}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in"
    style="background: rgba(0, 0, 0, 0.9);"
    onclick={closeViewer}
    role="dialog"
    aria-modal="true"
    aria-label="Media viewer"
  >
    <!-- Close -->
    <button
      class="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-95"
      style="color: white;"
      onclick={closeViewer}
      aria-label="Close viewer"
    >
      <X size={24} />
    </button>

    <!-- Prev -->
    {#if hasPrev}
      <button
        class="absolute left-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-95"
        style="color: white; background: rgba(255,255,255,0.1);"
        onclick={(e) => { e.stopPropagation(); prevItem(); }}
        aria-label="Previous"
      >
        <ChevronLeft size={28} />
      </button>
    {/if}

    <!-- Image -->
    <img
      src={currentItem.url}
      alt=""
      class="max-w-full max-h-full object-contain animate-scale-in"
      onclick|stopPropagation
    />

    <!-- Next -->
    {#if hasNext}
      <button
        class="absolute right-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-95"
        style="color: white; background: rgba(255,255,255,0.1);"
        onclick={(e) => { e.stopPropagation(); nextItem(); }}
        aria-label="Next"
      >
        <ChevronRight size={28} />
      </button>
    {/if}

    <!-- Counter -->
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm font-medium" style="color: rgba(255,255,255,0.7);">
      {selectedIndex + 1} / {items.length}
    </div>
  </div>
{/if}