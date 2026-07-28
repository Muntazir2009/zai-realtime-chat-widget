<script lang="ts">
  /**
   * MiniPlayer — Premium floating player with segmented tab navigation.
   * Monochrome, matte surfaces, clear visual hierarchy.
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

  const isPlaying = $derived(playerStore.status === 'playing');
  const isLoading = $derived(playerStore.status === 'loading');
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
  <!-- ── Header bar ── -->
  <div class="mp-header">
    <div class="mp-status-row">
      {#if playerStore.currentTrack}
        <div class="mp-art-wrap">
          <img
            class="mp-art"
            class:mp-art-spin={isPlaying}
            src={playerStore.currentTrack.thumbnail}
            alt=""
          />
          {#if isPlaying}
            <span class="mp-art-wave">
              <span></span><span></span><span></span><span></span>
            </span>
          {/if}
        </div>
        <div class="mp-info">
          <p class="mp-title">{truncate(playerStore.currentTrack.title, 32)}</p>
          <p class="mp-artist">{playerStore.currentTrack.artist}</p>
        </div>
      {:else}
        <div class="mp-art-wrap mp-art-empty">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <div class="mp-info">
          <p class="mp-title mp-title-empty">No track playing</p>
          <p class="mp-artist mp-artist-empty">Search music to get started</p>
        </div>
      {/if}
    </div>

    <!-- Close button -->
    <button class="mp-close" onclick={() => playerStore.collapse()} aria-label="Close player">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <!-- ── Progress bar ── -->
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
    <div class="mp-prog-spacer"></div>
  {/if}

  <!-- ── Transport controls ── -->
  <div class="mp-controls">
    <!-- Previous -->
    <button class="mp-btn mp-btn-secondary" onclick={() => playerStore.playPrevious()} aria-label="Previous track">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
      </svg>
    </button>

    <!-- Play / Pause (primary) -->
    <button class="mp-btn mp-btn-primary" onclick={() => playerStore.togglePlayPause()} aria-label={isPlaying ? 'Pause' : 'Play'}>
      {#if isPlaying}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      {:else if isLoading}
        <span class="mp-btn-loader"></span>
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="7 4 20 12 7 20"/>
        </svg>
      {/if}
    </button>

    <!-- Next -->
    <button class="mp-btn mp-btn-secondary" onclick={() => playerStore.playNext()} aria-label="Next track">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 18h2V6h-2zm-2-6L5.5 6v12z"/>
      </svg>
    </button>
  </div>

  <!-- ── Segmented tab control ── -->
  <div class="mp-seg">
    <button
      class="mp-seg-btn"
      class:mp-seg-on={currentTab === 'player'}
      onclick={() => { playerStore.isSearchOpen = false; playerStore.isQueueOpen = false; }}
    >
      Now Playing
    </button>
    <button
      class="mp-seg-btn"
      class:mp-seg-on={currentTab === 'search'}
      onclick={() => playerStore.toggleSearch()}
    >
      Search
    </button>
    <button
      class="mp-seg-btn"
      class:mp-seg-on={currentTab === 'queue'}
      onclick={() => playerStore.toggleQueue()}
    >
      Queue{#if playerStore.queue.length > 0} ({playerStore.queue.length}){/if}
    </button>
  </div>

  <!-- ── Panel area ── -->
  <div class="mp-panel">
    {#if playerStore.isSearchOpen}
      <SearchSheet />
    {:else if playerStore.isQueueOpen}
      <QueuePanel />
    {:else}
      <div class="mp-now-playing">
        {#if playerStore.currentTrack}
          <div class="mp-np-art">
            <img
              src={playerStore.currentTrack.thumbnail}
              alt=""
              class:mp-np-art-spin={isPlaying}
            />
            {#if isPlaying}
              <span class="mp-np-eq">
                <span></span><span></span><span></span><span></span><span></span>
              </span>
            {/if}
          </div>
          <div class="mp-np-details">
            <p class="mp-np-title">{playerStore.currentTrack.title}</p>
            <p class="mp-np-artist">{playerStore.currentTrack.artist}</p>
            <p class="mp-np-status">{statusLabel}</p>
          </div>
        {:else}
          <div class="mp-np-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"
              style="opacity: 0.2;">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <span>No music playing</span>
            <span class="mp-np-hint">Search for songs to start listening</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- ── Error banner ── -->
  {#if playerStore.status === 'error' && playerStore.errorMessage}
    <div class="mp-error">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
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
    width: 300px;
    max-height: 460px;
    border-radius: 20px;
    background: var(--bg-elevated, #181818);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    box-shadow:
      0 1px 2px rgba(0,0,0,0.06),
      0 4px 12px rgba(0,0,0,0.10),
      0 16px 48px rgba(0,0,0,0.14),
      0 0 0 1px rgba(255,255,255,0.02);
    overflow: hidden;
    position: relative;
    animation: mpEnter 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes mpEnter {
    from { opacity: 0; transform: scale(0.93) translateY(12px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ── Header bar ── */
  .mp-header {
    display: flex;
    align-items: center;
    padding: 12px 12px 10px 14px;
    gap: 8px;
  }

  .mp-status-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .mp-close {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    background: var(--bg-surface, rgba(255,255,255,0.04));
    color: var(--text-tertiary, #666);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.7;
    transition: opacity 150ms, background 150ms, color 150ms;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
    outline: none;
  }

  .mp-close:hover, .mp-close:active {
    opacity: 1;
    background: var(--border-subtle, rgba(255,255,255,0.10));
    color: var(--text-primary, #fff);
  }

  /* ── Album art ── */
  .mp-art-wrap {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--bg-surface, rgba(255,255,255,0.04));
    position: relative;
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
    animation: artRotate 12s linear infinite;
  }

  @keyframes artRotate { to { transform: rotate(360deg); } }

  /* ── Small wave indicator on art ── */
  .mp-art-wave {
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 1.5px;
    height: 10px;
  }

  .mp-art-wave span {
    display: block;
    width: 2px;
    border-radius: 1px;
    background: var(--text-primary, #fff);
    animation: miniWave 0.9s ease-in-out infinite;
  }

  .mp-art-wave span:nth-child(1) { height: 30%; animation-delay: 0ms; }
  .mp-art-wave span:nth-child(2) { height: 70%; animation-delay: 120ms; }
  .mp-art-wave span:nth-child(3) { height: 100%; animation-delay: 240ms; }
  .mp-art-wave span:nth-child(4) { height: 55%; animation-delay: 360ms; }

  @keyframes miniWave {
    0%, 100% { transform: scaleY(0.4); opacity: 0.8; }
    50% { transform: scaleY(1); opacity: 1; }
  }

  /* ── Track info ── */
  .mp-info {
    flex: 1;
    min-width: 0;
  }

  .mp-title {
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-primary, #fff);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mp-title-empty {
    color: var(--text-tertiary, #555);
    font-weight: 500;
    font-size: 13px;
  }

  .mp-artist {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-tertiary, #666);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 2px 0 0;
  }

  .mp-artist-empty {
    color: var(--text-tertiary, #444);
    font-size: 11px;
  }

  /* ── Progress bar ── */
  .mp-prog {
    padding: 2px 16px 0;
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .mp-prog-spacer {
    height: 20px;
  }

  .mp-prog-bar {
    height: 4px;
    border-radius: 4px;
    background: var(--border-subtle, rgba(255,255,255,0.10));
    position: relative;
    transition: height 120ms ease;
  }

  .mp-prog:active .mp-prog-bar {
    height: 6px;
  }

  .mp-prog-fill {
    height: 100%;
    border-radius: 4px;
    background: var(--text-primary, #fff);
    opacity: 0.65;
    transition: opacity 120ms;
    will-change: width;
  }

  .mp-prog:active .mp-prog-fill {
    opacity: 1;
  }

  .mp-prog-thumb {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-primary, #fff);
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 150ms ease;
    box-shadow: 0 0 6px rgba(0,0,0,0.3);
    pointer-events: none;
  }

  .mp-prog:hover .mp-prog-thumb,
  .mp-prog:active .mp-prog-thumb {
    opacity: 1;
  }

  .mp-times {
    display: flex;
    justify-content: space-between;
    padding-top: 5px;
  }

  .mp-times span {
    font-size: 10.5px;
    color: var(--text-tertiary, #555);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  /* ── Transport controls ── */
  .mp-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 8px 16px 10px;
  }

  .mp-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    border-radius: 50%;
    transition: background 120ms, transform 120ms, opacity 120ms;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
    outline: none;
  }

  .mp-btn:active {
    transform: scale(0.92);
  }

  /* Secondary buttons (prev/next) */
  .mp-btn-secondary {
    width: 40px;
    height: 40px;
    background: var(--bg-surface, rgba(255,255,255,0.05));
    color: var(--text-secondary, #aaa);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  }

  .mp-btn-secondary:hover {
    background: var(--border-subtle, rgba(255,255,255,0.10));
    color: var(--text-primary, #fff);
  }

  .mp-btn-secondary:active {
    background: var(--border-subtle, rgba(255,255,255,0.14));
    transform: scale(0.92);
  }

  /* Primary button (play/pause) */
  .mp-btn-primary {
    width: 50px;
    height: 50px;
    background: var(--text-primary, #fff);
    color: var(--bg-elevated, #181818);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.04);
  }

  .mp-btn-primary:hover {
    filter: brightness(1.05);
  }

  .mp-btn-primary:active {
    opacity: 0.88;
    transform: scale(0.92);
  }

  .mp-btn-loader {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(0,0,0,0.12);
    border-top-color: rgba(0,0,0,0.65);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    display: block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Segmented tab control ── */
  .mp-seg {
    display: flex;
    margin: 0 14px;
    background: var(--bg-surface, rgba(255,255,255,0.04));
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }

  .mp-seg-btn {
    flex: 1;
    height: 34px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-tertiary, #666);
    font-size: 11.5px;
    font-weight: 550;
    font-family: inherit;
    cursor: pointer;
    transition: background 180ms ease, color 180ms ease;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
    outline: none;
  }

  .mp-seg-btn:hover {
    color: var(--text-secondary, #aaa);
  }

  .mp-seg-on {
    background: var(--bg-elevated, #222);
    color: var(--text-primary, #fff);
    box-shadow: 0 1px 3px rgba(0,0,0,0.18);
  }

  .mp-seg-on:hover {
    color: var(--text-primary, #fff);
  }

  /* ── Panel area ── */
  .mp-panel {
    flex: 1;
    min-height: 0;
    max-height: 220px;
    overflow: hidden;
  }

  /* ── Now playing view ── */
  .mp-now-playing {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 20px 12px;
    gap: 12px;
  }

  .mp-np-art {
    width: 80px;
    height: 80px;
    border-radius: 16px;
    overflow: hidden;
    background: var(--bg-surface, rgba(255,255,255,0.04));
    flex-shrink: 0;
    position: relative;
  }

  .mp-np-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mp-np-art-spin {
    animation: artRotate 12s linear infinite;
  }

  /* Wave equalizer overlay on now-playing art */
  .mp-np-eq {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 2.5px;
    height: 16px;
  }

  .mp-np-eq span {
    display: block;
    width: 3px;
    border-radius: 2px;
    background: var(--text-primary, #fff);
    animation: wavePulse 1.2s ease-in-out infinite;
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
  }

  .mp-np-eq span:nth-child(1) { height: 30%; animation-delay: 0ms; }
  .mp-np-eq span:nth-child(2) { height: 70%; animation-delay: 100ms; }
  .mp-np-eq span:nth-child(3) { height: 100%; animation-delay: 200ms; }
  .mp-np-eq span:nth-child(4) { height: 50%; animation-delay: 300ms; }
  .mp-np-eq span:nth-child(5) { height: 80%; animation-delay: 150ms; }

  @keyframes wavePulse {
    0%, 100% { transform: scaleY(0.35); opacity: 0.7; }
    50% { transform: scaleY(1); opacity: 1; }
  }

  .mp-np-details {
    text-align: center;
    max-width: 100%;
  }

  .mp-np-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #fff);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mp-np-artist {
    font-size: 12px;
    color: var(--text-tertiary, #666);
    margin: 3px 0 0;
  }

  .mp-np-status {
    font-size: 10.5px;
    color: var(--text-tertiary, #444);
    margin: 4px 0 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
  }

  /* ── Now playing empty state ── */
  .mp-np-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 0;
  }

  .mp-np-empty > span {
    font-size: 12px;
    color: var(--text-tertiary, #555);
    font-weight: 400;
  }

  .mp-np-hint {
    font-size: 11px !important;
    color: var(--text-tertiary, #3a3a3a) !important;
    margin-top: -2px;
  }

  /* ── Error banner ── */
  .mp-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid rgba(239, 68, 68, 0.12);
    background: rgba(239, 68, 68, 0.05);
  }

  .mp-error svg {
    color: var(--color-danger, #ef4444);
    flex-shrink: 0;
  }

  .mp-error span {
    font-size: 11.5px;
    color: var(--color-danger, #ef4444);
    line-height: 1.3;
  }
</style>
