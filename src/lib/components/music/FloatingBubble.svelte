<script lang="ts">
  /**
   * FloatingBubble — Draggable orb that expands into MiniPlayer.
   * Lazy loads the entire music module on first tap.
   * Monochrome, minimal, premium.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';

  // ── State ──
  let isExpanded = $derived(playerStore.isExpanded);
  let isPlaying = $derived(playerStore.status === 'playing');
  let hasTrack = $derived(!!playerStore.currentTrack);

  // Bubble position (initialized to bottom-right)
  let bubbleX = $state(0);
  let bubbleY = $state(0);

  // Drag state
  let isDragging = $state(false);
  let dragMoved = $state(false);
  let pointerDownPos = { x: 0, y: 0 };
  let bubbleStartPos = { x: 0, y: 0 };

  // Lazy loaded module — must be $state for Svelte 5 reactivity
  let MiniPlayerComponent: any = $state(null);
  let moduleLoaded = $state(false);
  let isLoading = $state(false);

  // ── Lifecycle ──
  $effect(() => {
    if (!isExpanded) positionBubbleDefault();
  });

  function positionBubbleDefault() {
    if (typeof window === 'undefined') return;
    bubbleX = window.innerWidth - 60;
    bubbleY = window.innerHeight - 180;
  }

  // ── Lazy loading ──
  async function loadModule() {
    if (moduleLoaded || isLoading) return;
    isLoading = true;
    try {
      const mod = await import('./MiniPlayer.svelte');
      MiniPlayerComponent = mod.default;
      moduleLoaded = true;
    } catch (err) {
      console.error('[MusicBubble] Failed to load player:', err);
    } finally {
      isLoading = false;
    }
  }

  // ── Bubble interactions ──
  function onBubblePointerDown(e: PointerEvent) {
    e.stopPropagation();
    isDragging = true;
    dragMoved = false;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    bubbleStartPos = { x: bubbleX, y: bubbleY };

    document.addEventListener('pointermove', onDocPointerMove, { passive: false });
    document.addEventListener('pointerup', onDocPointerUp);
  }

  function onDocPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMoved = true;
    if (!dragMoved) return;
    bubbleX = bubbleStartPos.x + dx;
    bubbleY = bubbleStartPos.y + dy;
  }

  function onDocPointerUp(_e: PointerEvent) {
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('pointerup', onDocPointerUp);

    if (!dragMoved) {
      // Tap — expand or load
      if (!isExpanded) {
        playerStore.expand();
        if (!moduleLoaded) loadModule();
      } else {
        playerStore.collapse();
      }
    } else {
      // Snap to nearest edge
      snapToEdge();
    }
    isDragging = false;
  }

  function snapToEdge() {
    if (typeof window === 'undefined') return;
    const midX = window.innerWidth / 2;
    const padding = 16;
    const minY = 80;
    const maxY = window.innerHeight - 140;

    // Snap X to nearest side
    if (bubbleX < midX) {
      bubbleX = padding;
    } else {
      bubbleX = window.innerWidth - 52 - padding;
    }
    // Clamp Y
    bubbleY = Math.max(minY, Math.min(maxY, bubbleY));
  }

  // ── Progress for bubble ring ──
  const progress = $derived(
    playerStore.duration > 0 ? playerStore.currentTime / playerStore.duration : 0
  );

  const circumference = 2 * Math.PI * 18; // r=18
</script>

<svelte:window onresize={() => { if (!isExpanded) snapToEdge(); }} />

<!-- Floating bubble (visible when collapsed) -->
{#if !isExpanded}
  <div
    class="music-bubble"
    style="transform: translate3d({bubbleX}px, {bubbleY}px, 0);"
    onpointerdown={onBubblePointerDown}
    role="button"
    aria-label="Music player"
    tabindex="0"
  >
    <!-- Ring progress -->
    {#if hasTrack}
      <svg class="bubble-ring" viewBox="0 0 44 44">
        <circle
          cx="22" cy="22" r="18"
          fill="none"
          stroke="var(--text-primary)"
          stroke-width="2"
          stroke-dasharray="{circumference}"
          stroke-dashoffset="{circumference * (1 - progress)}"
          stroke-linecap="round"
          transform="rotate(-90 22 22)"
          opacity="0.3"
        />
      </svg>
    {/if}

    <!-- Content -->
    <div class="bubble-inner">
      {#if hasTrack && playerStore.currentTrack?.thumbnail}
        <img
          class="bubble-thumb"
          src={playerStore.currentTrack.thumbnail}
          alt=""
        />
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      {/if}
    </div>

    {#if isPlaying}
      <div class="bubble-pulse"></div>
    {/if}
  </div>
{/if}

<!-- Expanded player (lazy loaded) -->
{#if isExpanded}
  <div
    class="player-float"
    style="transform: translate3d({Math.min(bubbleX, window.innerWidth - 296)}px, {Math.min(bubbleY, window.innerHeight - 440)}px, 0);"
  >
    {#if isLoading}
      <div class="player-loading">
        <span class="player-spinner"></span>
      </div>
    {:else if moduleLoaded && MiniPlayerComponent}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <MiniPlayerComponent />
    {/if}
  </div>
{/if}

<style>
  /* ── Bubble ── */
  .music-bubble {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100;
    width: 44px;
    height: 44px;
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    will-change: transform;
  }

  .bubble-inner {
    animation: bubblePop 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes bubblePop {
    from { opacity: 0; transform: scale(0.5); }
    to { opacity: 1; transform: scale(1); }
  }

  .music-bubble:active {
    cursor: grabbing;
  }

  .bubble-inner {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.04);
    color: var(--text-secondary);
    overflow: hidden;
    transition: box-shadow 200ms ease;
  }

  .music-bubble:active .bubble-inner {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  }

  .bubble-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .bubble-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 44px;
    height: 44px;
    pointer-events: none;
  }

  .bubble-pulse {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-primary);
    opacity: 0.5;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.3); opacity: 0.2; }
  }

  /* ── Expanded player ── */
  .player-float {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100;
    will-change: transform;
  }

  .player-loading {
    width: 280px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12);
    animation: mpIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes mpIn {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }

  .player-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--text-primary);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    display: block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
