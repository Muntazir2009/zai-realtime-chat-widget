<script lang="ts">
  /**
   * MiniPlayer — Premium floating music player.
   * Clean layout: album art, track info, controls, tabs, panel.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { audioService } from '$lib/music/audio.js';
  import { formatDuration, truncate } from '$lib/music/music-utils.js';
  import SearchSheet from './SearchSheet.svelte';
  import QueuePanel from './QueuePanel.svelte';
  import { onMount } from 'svelte';

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
    updateProgress(e);
  }

  function handleProgressMove(e: PointerEvent) {
    if (!isDraggingProgress || !progressRef) return;
    updateProgress(e);
  }

  function updateProgress(e: PointerEvent) {
    if (!progressRef) return;
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

  const isPlaying = $derived(playerStore.status === 'playing');
  const isLoading = $derived(playerStore.status === 'loading');
</script>

<svelte:window onpointermove={handleProgressMove} onpointerup={handleProgressUp} />

<div class="mp">
  <!-- ── Header: close + track info ── -->
  <div class="mp-header">
    <button class="mp-close" onclick={() => playerStore.collapse()} aria-label="Close player">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
      </svg>
    </button>

    {#if playerStore.currentTrack}
      <div class="mp-track-info">
        <img class="mp-thumb" src={playerStore.currentTrack.thumbnail} alt="" />
        <div class="mp-meta">
          <p class="mp-title">{truncate(playerStore.currentTrack.title, 30)}</p>
          <p class="mp-artist">{playerStore.currentTrack.artist || 'Unknown Artist'}</p>
        </div>
      </div>
    {:else}
      <div class="mp-track-info">
        <div class="mp-thumb-empty">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <div class="mp-meta">
          <p class="mp-title mp-title-dim">No track playing</p>
          <p class="mp-artist">Search to get started</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- ── Progress bar ── -->
  {#if playerStore.currentTrack}
    <div class="mp-prog-wrap" bind:this={progressRef} onpointerdown={handleProgressDown}>
      <div class="mp-prog-track">
        <div class="mp-prog-fill" style="width: {progress * 100}%"></div>
        <div class="mp-prog-thumb-el" style="left: {progress * 100}%"></div>
      </div>
      <div class="mp-times">
        <span>{formatDuration(playerStore.currentTime)}</span>
        <span>{formatDuration(playerStore.duration)}</span>
      </div>
    </div>
  {:else}
    <div class="mp-prog-spacer"></div>
  {/if}

  <!-- ── Transport controls ── -->
  <div class="mp-transport">
    <button class="mp-btn mp-btn-sm" onclick={() => playerStore.playPrevious()} aria-label="Previous">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
      </svg>
    </button>

    <button class="mp-btn mp-btn-play" onclick={() => playerStore.togglePlayPause()} aria-label={isPlaying ? 'Pause' : 'Play'}>
      {#if isLoading}
        <span class="mp-spinner"></span>
      {:else if isPlaying}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1.5"/>
          <rect x="14" y="4" width="4" height="16" rx="1.5"/>
        </svg>
      {:else}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="8 5 20 12 8 19"/>
        </svg>
      {/if}
    </button>

    <button class="mp-btn mp-btn-sm" onclick={() => playerStore.playNext()} aria-label="Next">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 18h2V6h-2zm-2-6L5.5 6v12z"/>
      </svg>
    </button>
  </div>

  <!-- ── Tab navigation ── -->
  <div class="mp-tabs">
    <button class="mp-tab" class:mp-tab-active={currentTab === 'player'}
      onclick={() => { playerStore.isSearchOpen = false; playerStore.isQueueOpen = false; }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
      </svg>
      <span>Now</span>
    </button>
    <button class="mp-tab" class:mp-tab-active={currentTab === 'search'} onclick={() => playerStore.toggleSearch()}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>Search</span>
    </button>
    <button class="mp-tab" class:mp-tab-active={currentTab === 'queue'} onclick={() => playerStore.toggleQueue()}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      </svg>
      <span>Queue{#if playerStore.queue.length > 0} ({playerStore.queue.length}){/if}</span>
    </button>
  </div>

  <!-- ── Panel ── -->
  <div class="mp-panel">
    {#if playerStore.isSearchOpen}
      <SearchSheet />
    {:else if playerStore.isQueueOpen}
      <QueuePanel />
    {:else if playerStore.currentTrack}
      <div class="mp-now">
        <div class="mp-now-art">
          <img src={playerStore.currentTrack.thumbnail} alt="" class:spinning={isPlaying} />
          {#if isPlaying}
            <div class="mp-now-eq">
              <i></i><i></i><i></i><i></i><i></i>
            </div>
          {/if}
        </div>
        <p class="mp-now-title">{playerStore.currentTrack.title}</p>
        <p class="mp-now-artist">{playerStore.currentTrack.artist || 'Unknown Artist'}</p>
        {#if playerStore.status === 'loading'}
          <p class="mp-now-status">Buffering…</p>
        {:else if playerStore.status === 'paused'}
          <p class="mp-now-status">Paused</p>
        {:else if playerStore.status === 'playing'}
          <p class="mp-now-status">Playing</p>
        {/if}
      </div>
    {:else}
      <div class="mp-empty-panel">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.12">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        <span>Search for songs to start listening</span>
      </div>
    {/if}
  </div>

  <!-- ── Error ── -->
  {#if playerStore.status === 'error' && playerStore.errorMessage}
    <div class="mp-error">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
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
    width: 310px;
    max-height: 480px;
    border-radius: 20px;
    background: var(--bg-elevated, #1a1a1a);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    box-shadow:
      0 2px 4px rgba(0,0,0,0.06),
      0 8px 24px rgba(0,0,0,0.12),
      0 24px 64px rgba(0,0,0,0.16);
    overflow: hidden;
    animation: mpSlideIn 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes mpSlideIn {
    from { opacity: 0; transform: scale(0.94) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ── Header ── */
  .mp-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 8px 14px;
  }

  .mp-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--bg-surface, rgba(255,255,255,0.04));
    color: var(--text-tertiary, #666);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 150ms;
    padding: 0;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  .mp-close:hover { color: var(--text-secondary, #aaa); background: var(--bg-surface, rgba(255,255,255,0.08)); }
  .mp-close:active { color: var(--text-primary, #fff); transform: scale(0.92); }

  /* ── Track info in header ── */
  .mp-track-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .mp-thumb {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--bg-surface, rgba(255,255,255,0.04));
  }

  .mp-thumb-empty {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--bg-surface, rgba(255,255,255,0.04));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary, #444);
    flex-shrink: 0;
  }

  .mp-meta { flex: 1; min-width: 0; }

  .mp-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-primary, #fff);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mp-title-dim { color: var(--text-tertiary, #555); font-weight: 500; }

  .mp-artist {
    font-size: 11.5px;
    color: var(--text-tertiary, #666);
    margin: 1px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Progress ── */
  .mp-prog-wrap {
    padding: 4px 16px 0;
    cursor: pointer;
    touch-action: none;
  }

  .mp-prog-spacer { height: 24px; }

  .mp-prog-track {
    height: 3px;
    border-radius: 3px;
    background: var(--bg-surface, rgba(255,255,255,0.08));
    position: relative;
    transition: height 100ms;
  }

  .mp-prog-wrap:active .mp-prog-track { height: 5px; }

  .mp-prog-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--text-primary, #fff);
    opacity: 0.5;
    transition: opacity 100ms;
    will-change: width;
  }

  .mp-prog-wrap:active .mp-prog-fill { opacity: 0.9; }

  .mp-prog-thumb-el {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-primary, #fff);
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 120ms;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    pointer-events: none;
  }

  .mp-prog-wrap:hover .mp-prog-thumb-el,
  .mp-prog-wrap:active .mp-prog-thumb-el { opacity: 1; }

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
  }

  /* ── Transport controls ── */
  .mp-transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 6px 16px 10px;
  }

  .mp-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: all 120ms cubic-bezier(0.22, 1, 0.36, 1);
    -webkit-tap-highlight-color: transparent;
    padding: 0;
    outline: none;
  }

  .mp-btn:active { transform: scale(0.90); }

  .mp-btn-sm {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: transparent;
    color: var(--text-secondary, #999);
  }

  .mp-btn-sm:hover { color: var(--text-primary, #fff); background: var(--bg-surface, rgba(255,255,255,0.06)); }
  .mp-btn-sm:active { color: var(--text-primary, #fff); background: var(--bg-surface, rgba(255,255,255,0.10)); transform: scale(0.90); }

  .mp-btn-play {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--text-primary, #fff);
    color: var(--bg-elevated, #1a1a1a);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(255,255,255,0.06);
  }

  .mp-btn-play:hover { filter: brightness(1.06); box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
  .mp-btn-play:active { filter: brightness(0.94); transform: scale(0.90); }

  .mp-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(0,0,0,0.12);
    border-top-color: rgba(0,0,0,0.6);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    display: block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Tabs ── */
  .mp-tabs {
    display: flex;
    margin: 0 12px;
    background: var(--bg-surface, rgba(255,255,255,0.03));
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }

  .mp-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-tertiary, #555);
    font-size: 11px;
    font-weight: 550;
    font-family: inherit;
    cursor: pointer;
    transition: all 180ms ease;
    -webkit-tap-highlight-color: transparent;
    padding: 0 4px;
    outline: none;
  }

  .mp-tab:hover { color: var(--text-secondary, #999); }
  .mp-tab:active { transform: scale(0.97); }

  .mp-tab-active {
    background: var(--bg-elevated, #252525);
    color: var(--text-primary, #fff);
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }

  .mp-tab-active:hover { color: var(--text-primary, #fff); }

  /* ── Panel ── */
  .mp-panel {
    flex: 1;
    min-height: 0;
    max-height: 220px;
    overflow: hidden;
  }

  /* ── Now Playing ── */
  .mp-now {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 20px 10px;
    gap: 8px;
  }

  .mp-now-art {
    width: 72px;
    height: 72px;
    border-radius: 16px;
    overflow: hidden;
    background: var(--bg-surface, rgba(255,255,255,0.04));
    flex-shrink: 0;
    position: relative;
  }

  .mp-now-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mp-now-art img.spinning {
    animation: artSpin 10s linear infinite;
  }

  @keyframes artSpin { to { transform: rotate(360deg); } }

  .mp-now-eq {
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
  }

  .mp-now-eq i {
    display: block;
    width: 2.5px;
    border-radius: 1.5px;
    background: var(--text-primary, #fff);
    animation: eqPulse 1s ease-in-out infinite;
  }

  .mp-now-eq i:nth-child(1) { height: 30%; animation-delay: 0ms; }
  .mp-now-eq i:nth-child(2) { height: 75%; animation-delay: 120ms; }
  .mp-now-eq i:nth-child(3) { height: 100%; animation-delay: 240ms; }
  .mp-now-eq i:nth-child(4) { height: 50%; animation-delay: 80ms; }
  .mp-now-eq i:nth-child(5) { height: 85%; animation-delay: 200ms; }

  @keyframes eqPulse {
    0%, 100% { transform: scaleY(0.3); opacity: 0.6; }
    50% { transform: scaleY(1); opacity: 1; }
  }

  .mp-now-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #fff);
    text-align: center;
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mp-now-artist {
    font-size: 11.5px;
    color: var(--text-tertiary, #666);
    margin: 0;
  }

  .mp-now-status {
    font-size: 10px;
    color: var(--text-tertiary, #444);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
    margin: 0;
  }

  /* ── Empty panel ── */
  .mp-empty-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 16px;
    color: var(--text-tertiary, #555);
    font-size: 12px;
  }

  /* ── Error ── */
  .mp-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-top: 1px solid rgba(239, 68, 68, 0.12);
    background: rgba(239, 68, 68, 0.04);
  }

  .mp-error svg { color: #ef4444; flex-shrink: 0; }

  .mp-error span {
    font-size: 11px;
    color: #ef4444;
    line-height: 1.3;
  }
</style>
