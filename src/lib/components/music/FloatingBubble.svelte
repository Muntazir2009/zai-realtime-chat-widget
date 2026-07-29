<script lang="ts">
  /**
   * FloatingBubble — Premium 44px draggable orb that expands into MiniPlayer.
   * Monochrome matte aesthetic with waveform equalizer when playing.
   * Bubble is ALWAYS visible — click it to open or close the player.
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
      bubbleX = window.innerWidth - 60;
      bubbleY = window.innerHeight - 170;
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
      // Toggle expand/collapse on tap
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
    const maxY = window.innerHeight - 110;

    bubbleX = bubbleX < midX ? pad : window.innerWidth - 52 - pad;
    bubbleY = Math.max(minY, Math.min(maxY, bubbleY));
  }

  // ── Progress ring ──
  const progress = $derived(
    playerStore.duration > 0 ? playerStore.currentTime / playerStore.duration : 0
  );
  const circumference = 2 * Math.PI * 19;

  // ── Computed expanded position (keep near bubble, clamped to viewport) ──
  const expandedX = $derived.by(() => {
    if (typeof window === 'undefined') return 0;
    // Position above the bubble
    const baseX = Math.max(12, Math.min(bubbleX - 126, window.innerWidth - 320));
    return baseX;
  });
  const expandedY = $derived.by(() => {
    if (typeof window === 'undefined') return 0;
    // Position above the bubble with gap
    return Math.max(12, Math.min(bubbleY - 490, window.innerHeight - 500));
  });
</script>

<svelte:window
  onresize={() => { if (!isExpanded && _positionInitialized) snapToEdge(); }}
/>

<!-- ── Bubble — ALWAYS visible ── -->
<div
  class="fb-wrap"
  class:fb-dragging={isDragging}
  class:fb-active={isExpanded}
  style="transform: translate3d({bubbleX}px, {bubbleY}px, 0); z-index: {isExpanded ? 210 : 200};"
>
  <!-- Progress ring -->
  {#if hasTrack}
    <svg class="fb-ring" viewBox="0 0 44 44">
      <circle
        cx="22" cy="22" r="19"
        fill="none"
        stroke="var(--text-primary)"
        stroke-width="1.5"
        stroke-dasharray={circumference}
        stroke-dashoffset={circumference * (1 - progress)}
        stroke-linecap="round"
        transform="rotate(-90 22 22)"
        opacity="0.3"
      />
    </svg>
  {/if}

  <!-- Bubble body -->
  <button
    class="fb-body"
    onpointerdown={onBubblePointerDown}
    aria-label={isExpanded ? 'Close music player' : 'Open music player'}
  >
    {#if isExpanded}
      <!-- Close icon when expanded -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
      </svg>
    {:else if hasTrack && playerStore.currentTrack?.thumbnail}
      <img class="fb-thumb" src={playerStore.currentTrack.thumbnail} alt="" />
      <!-- Waveform overlay when playing -->
      {#if isPlaying}
        <span class="fb-wave-wrap">
          <span class="fb-wave"><span></span><span></span><span></span><span></span><span></span></span>
        </span>
      {/if}
    {:else}
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    {/if}
  </button>
</div>

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
    width: 44px;
    height: 44px;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    will-change: transform;
    transition: filter 200ms ease, box-shadow 250ms ease;
  }

  .fb-wrap:active {
    filter: brightness(0.95);
  }

  /* When player is expanded, give bubble a subtle glow */
  .fb-active .fb-body {
    background: var(--text-primary, #fff);
    color: var(--bg-elevated, #1a1a1a);
    box-shadow:
      0 2px 8px rgba(255,255,255,0.08),
      0 8px 24px rgba(0,0,0,0.18),
      0 0 0 2px rgba(255,255,255,0.15);
  }

  /* ── Bubble body ── */
  .fb-body {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-elevated, #181818);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.07));
    box-shadow:
      0 1px 2px rgba(0,0,0,0.08),
      0 4px 16px rgba(0,0,0,0.14),
      0 0 0 1px rgba(255,255,255,0.02);
    color: var(--text-secondary, #888);
    overflow: hidden;
    cursor: grab;
    padding: 0;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    transition: box-shadow 250ms ease, transform 150ms ease, background 200ms ease, color 200ms ease;
  }

  .fb-body:active {
    cursor: grabbing;
    box-shadow:
      0 2px 8px rgba(0,0,0,0.18),
      0 8px 28px rgba(0,0,0,0.16);
    transform: scale(0.95);
  }

  .fb-dragging .fb-body {
    box-shadow:
      0 4px 16px rgba(0,0,0,0.24),
      0 16px 40px rgba(0,0,0,0.18);
    transform: scale(1.06);
    transition: box-shadow 100ms, transform 100ms;
  }

  .fb-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* ── Waveform overlay ── */
  .fb-wave-wrap {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.45);
  }

  .fb-wave {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 18px;
  }

  .fb-wave span {
    display: block;
    width: 2.5px;
    border-radius: 2px;
    background: var(--text-primary, #fff);
    animation: wavePulse 1.2s ease-in-out infinite;
  }

  .fb-wave span:nth-child(1) { height: 30%; animation-delay: 0ms; }
  .fb-wave span:nth-child(2) { height: 70%; animation-delay: 100ms; }
  .fb-wave span:nth-child(3) { height: 100%; animation-delay: 200ms; }
  .fb-wave span:nth-child(4) { height: 50%; animation-delay: 300ms; }
  .fb-wave span:nth-child(5) { height: 80%; animation-delay: 150ms; }

  @keyframes wavePulse {
    0%, 100% { transform: scaleY(0.4); opacity: 0.7; }
    50% { transform: scaleY(1); opacity: 1; }
  }

  /* ── Progress ring ── */
  .fb-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 44px;
    height: 44px;
    pointer-events: none;
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
    width: 300px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 20px;
    background: var(--bg-elevated, #181818);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.07));
    box-shadow:
      0 2px 4px rgba(0,0,0,0.06),
      0 8px 24px rgba(0,0,0,0.14),
      0 0 0 1px rgba(255,255,255,0.02);
    animation: fpIn 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes fpIn {
    from { opacity: 0; transform: scale(0.92) translateY(10px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .fp-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-subtle, rgba(255,255,255,0.08));
    border-top-color: var(--text-primary, #fff);
    border-radius: 50%;
    animation: spin 700ms linear infinite;
    display: block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
