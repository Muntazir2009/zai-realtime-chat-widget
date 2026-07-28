<script lang="ts">
  /**
   * FloatingBubble — Premium draggable orb that expands into MiniPlayer.
   * Lazy loads the player module on first tap.
   * Monochrome, matte, premium aesthetic.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { onMount } from 'svelte';

  // ── Reactive state ──
  let isExpanded = $derived(playerStore.isExpanded);
  let isPlaying = $derived(playerStore.status === 'playing');
  let hasTrack = $derived(!!playerStore.currentTrack);

  // Bubble position — only set default once on mount
  let bubbleX = $state(0);
  let bubbleY = $state(0);
  let _positionInitialized = false;

  // Drag state
  let isDragging = $state(false);
  let dragMoved = $state(false);
  let pointerDownPos = { x: 0, y: 0 };
  let bubbleStartPos = { x: 0, y: 0 };

  // Lazy loaded module — must be $state for Svelte 5 reactivity
  let MiniPlayerComponent: any = $state(null);
  let moduleLoaded = $state(false);
  let isLoading = $state(false);

  // ── Lifecycle — position default only once ──
  onMount(() => {
    if (!_positionInitialized && typeof window !== 'undefined') {
      _positionInitialized = true;
      bubbleX = window.innerWidth - 56;
      bubbleY = window.innerHeight - 160;
    }
  });

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
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
    if (!dragMoved) return;
    bubbleX = bubbleStartPos.x + dx;
    bubbleY = bubbleStartPos.y + dy;
  }

  function onDocPointerUp(_e: PointerEvent) {
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('pointerup', onDocPointerUp);

    if (!dragMoved) {
      if (!isExpanded) {
        playerStore.expand();
        if (!moduleLoaded) loadModule();
      } else {
        playerStore.collapse();
      }
    } else {
      snapToEdge();
    }
    isDragging = false;
  }

  function snapToEdge() {
    if (typeof window === 'undefined') return;
    const midX = window.innerWidth / 2;
    const pad = 14;
    const minY = 60;
    const maxY = window.innerHeight - 100;

    bubbleX = bubbleX < midX ? pad : window.innerWidth - 48 - pad;
    bubbleY = Math.max(minY, Math.min(maxY, bubbleY));
  }

  // ── Progress ring ──
  const progress = $derived(
    playerStore.duration > 0 ? playerStore.currentTime / playerStore.duration : 0
  );
  const circumference = 2 * Math.PI * 17;

  // ── Computed expanded position (keep near bubble, clamped to viewport) ──
  const expandedX = $derived.by(() => {
    if (typeof window === 'undefined') return 0;
    return Math.max(12, Math.min(bubbleX - 118, window.innerWidth - 292));
  });
  const expandedY = $derived.by(() => {
    if (typeof window === 'undefined') return 0;
    return Math.max(12, Math.min(bubbleY - 180, window.innerHeight - 440));
  });
</script>

<svelte:window
  onresize={() => { if (!isExpanded && _positionInitialized) snapToEdge(); }}
/>

<!-- ── Collapsed Bubble ── -->
{#if !isExpanded}
  <div
    class="fb-wrap"
    class:fb-dragging={isDragging}
    style="transform: translate3d({bubbleX}px, {bubbleY}px, 0);"
  >
    <!-- Progress ring -->
    {#if hasTrack}
      <svg class="fb-ring" viewBox="0 0 40 40">
        <circle
          cx="20" cy="20" r="17"
          fill="none"
          stroke="var(--text-primary)"
          stroke-width="1.5"
          stroke-dasharray={circumference}
          stroke-dashoffset={circumference * (1 - progress)}
          stroke-linecap="round"
          transform="rotate(-90 20 20)"
          opacity="0.25"
        />
      </svg>
    {/if}

    <!-- Bubble body -->
    <button
      class="fb-body"
      onpointerdown={onBubblePointerDown}
      aria-label="Music player"
    >
      {#if hasTrack && playerStore.currentTrack?.thumbnail}
        <img class="fb-thumb" src={playerStore.currentTrack.thumbnail} alt="" />
      {:else}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      {/if}
    </button>

    <!-- Pulse dot when playing -->
    {#if isPlaying}
      <span class="fb-dot"></span>
    {/if}
  </div>
{/if}

<!-- ── Expanded Player ── -->
{#if isExpanded}
  <div
    class="fp-wrap"
    style="transform: translate3d({expandedX}px, {expandedY}px, 0);"
  >
    {#if isLoading}
      <div class="fp-loading">
        <span class="fp-spinner"></span>
      </div>
    {:else if moduleLoaded && MiniPlayerComponent}
      <MiniPlayerComponent />
    {/if}
  </div>
{/if}

<style>
  /* ── Bubble wrapper (positioning container) ── */
  .fb-wrap {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 200;
    width: 40px;
    height: 40px;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    will-change: transform;
    transition: filter 200ms ease;
  }

  .fb-wrap:active {
    filter: brightness(0.95);
  }

  /* ── Bubble body ── */
  .fb-body {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-elevated, #1a1a1a);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
    box-shadow:
      0 1px 3px rgba(0,0,0,0.12),
      0 4px 12px rgba(0,0,0,0.08);
    color: var(--text-secondary, #888);
    overflow: hidden;
    cursor: grab;
    padding: 0;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    transition: box-shadow 250ms ease, transform 150ms ease;
  }

  .fb-body:active {
    cursor: grabbing;
    box-shadow:
      0 2px 6px rgba(0,0,0,0.15),
      0 8px 24px rgba(0,0,0,0.12);
    transform: scale(0.95);
  }

  .fb-dragging .fb-body {
    box-shadow:
      0 4px 12px rgba(0,0,0,0.2),
      0 12px 32px rgba(0,0,0,0.15);
    transform: scale(1.05);
    transition: box-shadow 100ms, transform 100ms;
  }

  .fb-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  /* ── Progress ring ── */
  .fb-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 40px;
    height: 40px;
    pointer-events: none;
  }

  /* ── Pulse indicator ── */
  .fb-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-primary, #fff);
    opacity: 0.6;
    animation: dotPulse 2.4s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes dotPulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.4); opacity: 0.2; }
  }

  /* ── Expanded player wrapper ── */
  .fp-wrap {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 200;
    will-change: transform;
  }

  /* ── Loading state ── */
  .fp-loading {
    width: 268px;
    height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 20px;
    background: var(--bg-elevated, #1a1a1a);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
    box-shadow:
      0 4px 16px rgba(0,0,0,0.12),
      0 16px 48px rgba(0,0,0,0.10);
    animation: fpIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes fpIn {
    from { opacity: 0; transform: scale(0.92) translateY(6px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .fp-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-subtle, rgba(255,255,255,0.1));
    border-top-color: var(--text-primary, #fff);
    border-radius: 50%;
    animation: spin 700ms linear infinite;
    display: block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
