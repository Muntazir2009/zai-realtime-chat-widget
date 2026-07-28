<script lang="ts">
  /**
   * MiniPlayer — Premium floating mini player.
   * Monochrome, matte surfaces, clean typography.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { audioService } from '$lib/music/audio.js';
  import { formatDuration, truncate } from '$lib/music/music-utils.js';
  import SearchSheet from './SearchSheet.svelte';
  import QueuePanel from './QueuePanel.svelte';
  import { onMount } from 'svelte';

  // Ensure the hidden YouTube iframe container is created on mount
  onMount(() => {
    audioService.ensureContainer();
  });

  // ── Progress scrubbing ──
  let isDraggingProgress = $state(false);
  let dragRatio = $state(0);
  let progressRef: HTMLDivElement | null = $state(null);

  function handleProgressDown(e: PointerEvent) {
    if (!progressRef || playerStore.duration <= 0) return;
    e.stopPropagation();
    isDraggingProgress = true;
    const rect = progressRef.getBoundingClientRect();
    dragRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    playerStore.seek(dragRatio);
  }

  function handleProgressMove(e: PointerEvent) {
    if (!isDraggingProgress || !progressRef) return;
    const rect = progressRef.getBoundingClientRect();
    dragRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    playerStore.seek(dragRatio);
  }

  function handleProgressUp() {
    isDraggingProgress = false;
  }

  // ── Derived ──
  let currentTab = $derived(
    playerStore.isSearchOpen ? 'search' :
    playerStore.isQueueOpen ? 'queue' : 'player'
  );

  const progress = $derived(
    isDraggingProgress
      ? dragRatio
      : playerStore.duration > 0 ? playerStore.currentTime / playerStore.duration : 0
  );

  const statusLabel = $derived.by(() => {
    switch (playerStore.status) {
      case 'loading': return 'Loading…';
      case 'playing': return 'Playing';
      case 'paused': return 'Paused';
      case 'error': return 'Error';
      default: return 'Ready';
    }
  });
</script>

<svelte:window onpointermove={handleProgressMove} onpointerup={handleProgressUp} />

<div class="mp">
  <!-- ── Close button ── -->
  <button class="mp-close" onclick={() => playerStore.collapse()} aria-label="Close">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </button>

  <!-- ── Track info ── -->
  <div class="mp-track">
    {#if playerStore.currentTrack}
      <div class="mp-art-wrap">
        <img
          class="mp-art"
          class:mp-art-spin={playerStore.status === 'playing'}
          src={playerStore.currentTrack.thumbnail}
          alt=""
        />
      </div>
      <div class="mp-info">
        <p class="mp-title">{truncate(playerStore.currentTrack.title, 38)}</p>
        <p class="mp-artist">{playerStore.currentTrack.artist}</p>
      </div>
    {:else}
      <div class="mp-art-wrap mp-art-empty">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <div class="mp-info">
        <p class="mp-title mp-title-empty">No track playing</p>
        <p class="mp-artist mp-artist-empty">&nbsp;</p>
      </div>
    {/if}
  </div>

  <!-- ── Progress ── -->
  {#if playerStore.currentTrack}
    <div class="mp-prog" bind:this={progressRef} onpointerdown={handleProgressDown}>
      <div class="mp-prog-bar">
        <div class="mp-prog-fill" style="width: {progress * 100}%;"></div>
        <div class="mp-prog-thumb" style="left: {progress * 100}%;"></div>
      </div>
      <div class="mp-times">
        <span>{formatDuration(playerStore.currentTime)}</span>
        <span>{formatDuration(playerStore.duration)}</span>
      </div>
    </div>
  {:else}
    <div class="mp-prog mp-prog-empty"></div>
  {/if}

  <!-- ── Controls ── -->
  <div class="mp-controls">
    <button class="mp-btn mp-btn-sm" onclick={() => playerStore.playPrevious()} aria-label="Previous">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
      </svg>
    </button>

    <button class="mp-btn mp-btn-main" onclick={() => playerStore.togglePlayPause()} aria-label="Play/Pause">
      {#if playerStore.status === 'playing'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      {:else if playerStore.status === 'loading'}
        <span class="mp-btn-loader"></span>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 3 20 12 6 21 6 3"/>
        </svg>
      {/if}
    </button>

    <button class="mp-btn mp-btn-sm" onclick={() => playerStore.playNext()} aria-label="Next">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 18h2V6h-2zm-2-6L5.5 6v12z"/>
      </svg>
    </button>
  </div>

  <!-- ── Tabs ── -->
  <div class="mp-tabs">
    <button class="mp-tab" class:mp-tab-on={currentTab === 'player'}
      onclick={() => { playerStore.isSearchOpen = false; playerStore.isQueueOpen = false; }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
    </button>
    <button class="mp-tab" class:mp-tab-on={currentTab === 'search'}
      onclick={() => playerStore.toggleSearch()}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </button>
    <button class="mp-tab" class:mp-tab-on={currentTab === 'queue'}
      onclick={() => playerStore.toggleQueue()}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
      </svg>
    </button>
  </div>

  <!-- ── Panel ── -->
  <div class="mp-panel">
    {#if playerStore.isSearchOpen}
      <SearchSheet />
    {:else if playerStore.isQueueOpen}
      <QueuePanel />
    {:else}
      <div class="mp-empty">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
          style="opacity: 0.3;">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        <span>Tap search to find music</span>
      </div>
    {/if}
  </div>

  <!-- ── Error banner ── -->
  {#if playerStore.status === 'error' && playerStore.errorMessage}
    <div class="mp-error">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{playerStore.errorMessage}</span>
    </div>
  {/if}
</div>

<style>
  /* ── Card ── */
  .mp {
    display: flex;
    flex-direction: column;
    width: 268px;
    max-height: 400px;
    border-radius: 20px;
    background: var(--bg-elevated, #1a1a1a);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.07));
    box-shadow:
      0 2px 8px rgba(0,0,0,0.10),
      0 8px 32px rgba(0,0,0,0.12),
      0 0 0 1px rgba(255,255,255,0.02);
    overflow: hidden;
    position: relative;
    animation: mpEnter 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes mpEnter {
    from { opacity: 0; transform: scale(0.94) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ── Close button ── */
  .mp-close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: var(--bg-surface, rgba(255,255,255,0.06));
    color: var(--text-tertiary, #666);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2;
    opacity: 0.5;
    transition: opacity 150ms, background 150ms;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
  }

  .mp-close:hover, .mp-close:active {
    opacity: 1;
    background: var(--border-subtle, rgba(255,255,255,0.12));
  }

  /* ── Track info ── */
  .mp-track {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 14px 8px;
  }

  .mp-art-wrap {
    width: 46px;
    height: 46px;
    border-radius: 10px;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--bg-surface, rgba(255,255,255,0.04));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary, #555);
  }

  .mp-art-empty {
    border-radius: 50%;
  }

  .mp-art {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mp-art-spin {
    border-radius: 50%;
    animation: artRotate 12s linear infinite;
  }

  @keyframes artRotate { to { transform: rotate(360deg); } }

  .mp-info {
    flex: 1;
    min-width: 0;
  }

  .mp-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--text-primary, #fff);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mp-title-empty {
    color: var(--text-tertiary, #555);
    font-weight: 500;
  }

  .mp-artist {
    font-size: 11.5px;
    font-weight: 400;
    color: var(--text-tertiary, #666);
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 2px 0 0;
  }

  .mp-artist-empty {
    opacity: 0;
  }

  /* ── Progress ── */
  .mp-prog {
    padding: 6px 16px 4px;
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .mp-prog-empty {
    padding: 2px 16px;
  }

  .mp-prog-bar {
    height: 3px;
    border-radius: 3px;
    background: var(--border-subtle, rgba(255,255,255,0.08));
    position: relative;
    transition: height 100ms;
  }

  .mp-prog:active .mp-prog-bar {
    height: 5px;
  }

  .mp-prog-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--text-primary, #fff);
    opacity: 0.5;
    transition: opacity 100ms;
    will-change: width;
  }

  .mp-prog:active .mp-prog-fill {
    opacity: 0.8;
  }

  .mp-prog-thumb {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-primary, #fff);
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 100ms;
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
    pointer-events: none;
  }

  .mp-prog:active .mp-prog-thumb {
    opacity: 1;
  }

  .mp-times {
    display: flex;
    justify-content: space-between;
    padding-top: 4px;
  }

  .mp-times span {
    font-size: 10px;
    color: var(--text-tertiary, #555);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  /* ── Controls ── */
  .mp-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 6px 16px 8px;
  }

  .mp-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-primary, #fff);
    cursor: pointer;
    border-radius: 50%;
    transition: background 120ms, transform 120ms;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
    outline: none;
  }

  .mp-btn:active {
    transform: scale(0.92);
  }

  .mp-btn-sm {
    width: 34px;
    height: 34px;
  }

  .mp-btn-sm:active {
    background: var(--border-subtle, rgba(255,255,255,0.08));
  }

  .mp-btn-main {
    width: 40px;
    height: 40px;
    background: var(--text-primary, #fff);
    color: var(--bg-elevated, #1a1a1a);
  }

  .mp-btn-main:active {
    opacity: 0.85;
    transform: scale(0.92);
  }

  .mp-btn-loader {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(0,0,0,0.15);
    border-top-color: rgba(0,0,0,0.7);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    display: block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Tabs ── */
  .mp-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px 8px;
    border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.05));
  }

  .mp-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text-tertiary, #555);
    cursor: pointer;
    border-radius: 8px;
    transition: color 150ms, background 150ms;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
    outline: none;
  }

  .mp-tab:active, .mp-tab-on {
    color: var(--text-primary, #fff);
    background: var(--border-subtle, rgba(255,255,255,0.06));
  }

  /* ── Panel ── */
  .mp-panel {
    flex: 1;
    min-height: 0;
    max-height: 180px;
    overflow: hidden;
  }

  .mp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    padding: 20px;
  }

  .mp-empty span {
    font-size: 11.5px;
    color: var(--text-tertiary, #555);
    font-weight: 400;
  }

  /* ── Error ── */
  .mp-error {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px 10px;
    border-top: 1px solid rgba(239, 68, 68, 0.15);
    background: rgba(239, 68, 68, 0.06);
  }

  .mp-error svg {
    color: var(--color-danger, #ef4444);
    flex-shrink: 0;
  }

  .mp-error span {
    font-size: 11px;
    color: var(--color-danger, #ef4444);
    line-height: 1.3;
  }
</style>
