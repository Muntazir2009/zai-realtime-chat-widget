<script lang="ts">
  /**
   * SearchSheet — Compact search panel for YouTube music.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { formatDuration, truncate } from '$lib/music/music-utils.js';

  let query = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  function onInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      playerStore.search(query);
    }, 400);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && query.trim()) {
      if (searchTimer) clearTimeout(searchTimer);
      playerStore.search(query);
    }
  }
</script>

<div class="ss">
  <!-- ── Search bar ── -->
  <div class="ss-bar">
    <svg class="ss-icon" width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input
      type="text"
      class="ss-input"
      placeholder="Search songs or paste a link…"
      bind:value={query}
      oninput={onInput}
      onkeydown={handleKeydown}
    />
    {#if query}
      <button class="ss-clear" onclick={() => { query = ''; playerStore.searchResults = []; }} aria-label="Clear">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- ── Results ── -->
  {#if playerStore.isSearching}
    <div class="ss-state">
      <span class="ss-spinner"></span>
      <span>Searching…</span>
    </div>
  {:else if playerStore.searchResults.length > 0}
    <div class="ss-results">
      {#each playerStore.searchResults as result (result.id)}
        {@const isActive = playerStore.currentTrack?.id === result.id}
        <button
          class="ss-row"
          class:ss-row-active={isActive && playerStore.status === 'playing'}
          onclick={() => playerStore.playFromSearch(result)}
        >
          <img class="ss-thumb" src={result.thumbnail} alt="" loading="lazy" />
          <div class="ss-info">
            <p class="ss-title">{truncate(result.title, 45)}</p>
            <p class="ss-sub">{truncate(result.artist, 28)}</p>
          </div>
          <div class="ss-meta">
            {#if result.duration > 0}
              <span class="ss-dur">{formatDuration(result.duration)}</span>
            {/if}
            {#if isActive && playerStore.status === 'playing'}
              <span class="ss-eq">
                <span></span><span></span><span></span>
              </span>
            {:else}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {:else if query.trim()}
    <div class="ss-state">
      <span>No results for "{truncate(query, 20)}"</span>
    </div>
  {:else}
    <div class="ss-state ss-state-hint">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        style="opacity: 0.3;">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>Search songs or paste YouTube links</span>
    </div>
  {/if}
</div>

<style>
  .ss {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Search bar ── */
  .ss-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    flex-shrink: 0;
  }

  .ss-icon {
    flex-shrink: 0;
    color: var(--text-tertiary, #555);
  }

  .ss-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12.5px;
    font-weight: 400;
    color: var(--text-primary, #fff);
    font-family: inherit;
    padding: 0;
    -webkit-user-select: text;
    user-select: text;
  }

  .ss-input::placeholder {
    color: var(--text-tertiary, #555);
  }

  .ss-clear {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-tertiary, #666);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .ss-clear:active {
    background: var(--border-subtle, rgba(255,255,255,0.08));
  }

  /* ── Loading / empty ── */
  .ss-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 16px;
    font-size: 11.5px;
    color: var(--text-tertiary, #555);
  }

  .ss-state-hint {
    flex-direction: column;
    gap: 6px;
  }

  .ss-spinner {
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--border-subtle, rgba(255,255,255,0.1));
    border-top-color: var(--text-secondary, #999);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Results ── */
  .ss-results {
    flex: 1;
    overflow-y: auto;
    padding: 2px 6px;
    -webkit-overflow-scrolling: touch;
  }

  .ss-results::-webkit-scrollbar { width: 0; }

  .ss-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 8px;
    border-radius: 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary, #fff);
    font-family: inherit;
    transition: background 120ms;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }

  .ss-row:active {
    background: var(--border-subtle, rgba(255,255,255,0.06));
  }

  .ss-row-active {
    background: rgba(255,255,255,0.04);
  }

  .ss-thumb {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--bg-surface, rgba(255,255,255,0.04));
  }

  .ss-info {
    flex: 1;
    min-width: 0;
  }

  .ss-title {
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
    color: var(--text-primary, #fff);
  }

  .ss-sub {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-tertiary, #555);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 1px 0 0;
  }

  .ss-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    color: var(--text-tertiary, #555);
  }

  .ss-dur {
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  /* ── Equalizer bars (playing indicator) ── */
  .ss-eq {
    display: flex;
    align-items: flex-end;
    gap: 1.5px;
    height: 12px;
  }

  .ss-eq span {
    display: block;
    width: 2px;
    background: var(--text-primary, #fff);
    border-radius: 1px;
    animation: eqBounce 0.8s ease-in-out infinite;
  }

  .ss-eq span:nth-child(1) { height: 40%; animation-delay: 0ms; }
  .ss-eq span:nth-child(2) { height: 80%; animation-delay: 150ms; }
  .ss-eq span:nth-child(3) { height: 60%; animation-delay: 300ms; }

  @keyframes eqBounce {
    0%, 100% { transform: scaleY(0.5); }
    50% { transform: scaleY(1); }
  }
</style>
