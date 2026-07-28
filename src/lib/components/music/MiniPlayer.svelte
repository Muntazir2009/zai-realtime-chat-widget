<script lang="ts">
  /**
   * MiniPlayer — Premium floating mini player.
   * Monochrome, matte surfaces, minimal.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { formatDuration, truncate } from '$lib/music/music-utils.js';
  import SearchSheet from './SearchSheet.svelte';
  import QueuePanel from './QueuePanel.svelte';

  let isDraggingProgress = $state(false);
  let dragRatio = $state(0);
  let progressRef: HTMLDivElement | null = $state(null);

  function handleProgressDown(e: PointerEvent) {
    if (!progressRef || playerStore.duration <= 0) return;
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

  let currentTab = $derived(playerStore.isQueueOpen ? 'queue' : playerStore.isSearchOpen ? 'search' : 'player');

  const progress = $derived(isDraggingProgress ? dragRatio : playerStore.duration > 0 ? playerStore.currentTime / playerStore.duration : 0);
</script>

<svelte:window onpointermove={handleProgressMove} onpointerup={handleProgressUp} />

<div class="mini-player">
  <!-- Now playing info -->
  <div class="mp-track" class:mp-track-active={playerStore.currentTrack}>
    {#if playerStore.currentTrack}
      <img
        class="mp-art"
        src={playerStore.currentTrack.thumbnail}
        alt=""
        class:mp-art-spin={playerStore.status === 'playing'}
      />
      <div class="mp-info">
        <p class="mp-title">{truncate(playerStore.currentTrack.title, 35)}</p>
        <p class="mp-artist">{truncate(playerStore.currentTrack.artist, 22)}</p>
      </div>
    {:else}
      <div class="mp-art mp-art-placeholder">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <div class="mp-info">
        <p class="mp-title" style="color: var(--text-tertiary);">No track playing</p>
        <p class="mp-artist" style="opacity: 0;">&nbsp;</p>
      </div>
    {/if}
  </div>

  <!-- Progress bar -->
  {#if playerStore.currentTrack}
    <div
      class="mp-progress"
      bind:this={progressRef}
      onpointerdown={handleProgressDown}
    >
      <div class="mp-prog-track">
        <div class="mp-prog-fill" style="transform: scaleX({progress});" />
      </div>
      <div class="mp-times">
        <span>{formatDuration(playerStore.currentTime)}</span>
        <span>{formatDuration(playerStore.duration)}</span>
      </div>
    </div>
  {/if}

  <!-- Controls -->
  <div class="mp-controls">
    <button class="mp-ctrl mp-ctrl-sm" onclick={() => playerStore.playPrevious()} aria-label="Previous">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
      </svg>
    </button>

    <button class="mp-ctrl mp-ctrl-main" onclick={() => playerStore.togglePlayPause()} aria-label="Play/Pause">
      {#if playerStore.status === 'playing'}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      {:else if playerStore.status === 'loading'}
        <span class="mp-loader" />
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 3 20 12 6 21 6 3"/>
        </svg>
      {/if}
    </button>

    <button class="mp-ctrl mp-ctrl-sm" onclick={() => playerStore.playNext()} aria-label="Next">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 18h2V6h-2zm-10-6 8.5-6v12z" transform="scale(-1,1) translate(-24,0)"/>
      </svg>
    </button>
  </div>

  <!-- Tab bar -->
  <div class="mp-tabs">
    <button
      class="mp-tab"
      class:mp-tab-active={currentTab === 'player'}
      onclick={() => { playerStore.isSearchOpen = false; playerStore.isQueueOpen = false; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
    </button>
    <button
      class="mp-tab"
      class:mp-tab-active={currentTab === 'search'}
      onclick={() => playerStore.toggleSearch()}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </button>
    <button
      class="mp-tab"
      class:mp-tab-active={currentTab === 'queue'}
      onclick={() => playerStore.toggleQueue()}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    </button>
    <button
      class="mp-tab"
      onclick={() => playerStore.collapse()}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  </div>

  <!-- Panel area -->
  <div class="mp-panel">
    {#if playerStore.isSearchOpen}
      <SearchSheet />
    {:else if playerStore.isQueueOpen}
      <QueuePanel />
    {:else}
      <div class="mp-panel-empty">
        <p>Tap search to find music</p>
      </div>
    {/if}
  </div>

  <!-- Error -->
  {#if playerStore.status === 'error'}
    <div class="mp-error">
      <p>{playerStore.errorMessage || 'Playback error'}</p>
    </div>
  {/if}
</div>

<style>
  .mini-player {
    display: flex;
    flex-direction: column;
    width: 280px;
    max-height: 420px;
    border-radius: 16px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.05);
    overflow: hidden;
    will-change: transform, opacity;
    animation: mpIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes mpIn {
    from { opacity: 0; transform: scale(0.92) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* Track info */
  .mp-track {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 14px 10px;
  }

  .mp-art {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--bg-surface);
  }

  .mp-art-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
  }

  .mp-art-spin {
    border-radius: 50%;
    animation: artSpin 8s linear infinite;
  }

  @keyframes artSpin { to { transform: rotate(360deg); } }

  .mp-info {
    flex: 1;
    min-width: 0;
  }

  .mp-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
    margin: 0;
  }

  .mp-artist {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 1px 0 0;
  }

  /* Progress */
  .mp-progress {
    padding: 0 14px 4px;
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .mp-prog-track {
    height: 3px;
    border-radius: 2px;
    background: var(--border-subtle);
    position: relative;
    overflow: hidden;
  }

  .mp-prog-fill {
    height: 100%;
    width: 100%;
    border-radius: 2px;
    background: var(--text-primary);
    transform-origin: left center;
    will-change: transform;
    opacity: 0.6;
    transition: opacity 150ms;
  }

  .mp-progress:active .mp-prog-fill {
    opacity: 0.9;
    height: 4px;
    margin-top: -0.5px;
  }

  .mp-times {
    display: flex;
    justify-content: space-between;
    padding-top: 3px;
  }

  .mp-times span {
    font-size: 10px;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  /* Controls */
  .mp-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 8px 14px 10px;
  }

  .mp-ctrl {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    border-radius: 50%;
    transition: background 150ms;
    -webkit-tap-highlight-color: transparent;
  }

  .mp-ctrl:active {
    background: var(--border-subtle);
  }

  .mp-ctrl-sm {
    width: 36px;
    height: 36px;
  }

  .mp-ctrl-main {
    width: 42px;
    height: 42px;
  }

  .mp-loader {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--text-primary);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    display: block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Tab bar */
  .mp-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 14px 8px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .mp-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 6px;
    transition: color 150ms, background 150ms;
    -webkit-tap-highlight-color: transparent;
  }

  .mp-tab:active,
  .mp-tab-active {
    color: var(--text-primary);
    background: var(--border-subtle);
  }

  .mp-tab:last-child {
    margin-left: auto;
  }

  /* Panel */
  .mp-panel {
    flex: 1;
    min-height: 0;
    max-height: 200px;
    overflow: hidden;
  }

  .mp-panel-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .mp-panel-empty p {
    font-size: 12px;
    color: var(--text-tertiary);
    margin: 0;
  }

  /* Error */
  .mp-error {
    padding: 6px 14px 10px;
  }

  .mp-error p {
    font-size: 11px;
    color: var(--color-danger, #ef4444);
    margin: 0;
  }
</style>
