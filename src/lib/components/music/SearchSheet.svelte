<script lang="ts">
  /**
   * SearchSheet — Compact bottom sheet for YouTube music search.
   * Monochrome, minimal, premium.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { formatDuration, truncate } from '$lib/music/music-utils.js';

  let query = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  function onInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      playerStore.search(query);
    }, 350);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && query.trim()) {
      if (searchTimer) clearTimeout(searchTimer);
      playerStore.search(query);
    }
  }
</script>

<div class="search-sheet">
  <div class="search-header">
    <div class="search-input-wrap">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        class="search-input"
        placeholder="Search songs..."
        bind:value={query}
        oninput={onInput}
        onkeydown={handleKeydown}
      />
    </div>
  </div>

  {#if playerStore.isSearching}
    <div class="search-loading">
      <span class="search-spinner" />
      <span>Searching...</span>
    </div>
  {:else if playerStore.searchResults.length > 0}
    <div class="search-results">
      {#each playerStore.searchResults as result (result.id)}
        <button
          class="result-row"
          onclick={() => playerStore.playFromSearch(result)}
        >
          <img
            class="result-thumb"
            src={result.thumbnail}
            alt=""
            loading="lazy"
          />
          <div class="result-info">
            <p class="result-title">{truncate(result.title, 50)}</p>
            <p class="result-artist">{truncate(result.artist, 30)}</p>
          </div>
          <div class="result-meta">
            {#if result.duration > 0}
              <span class="result-dur">{formatDuration(result.duration)}</span>
            {/if}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              style="color: var(--text-tertiary);">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
        </button>
      {/each}
    </div>
  {:else if query.trim() && !playerStore.isSearching}
    <div class="search-empty">
      <p>No results found</p>
    </div>
  {:else}
    <div class="search-empty">
      <p>Type a song name or artist</p>
    </div>
  {/if}
</div>

<style>
  .search-sheet {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .search-header {
    padding: 12px 14px 8px;
    flex-shrink: 0;
  }

  .search-input-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--input-bg);
    border: 1px solid var(--border-subtle);
  }

  .search-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  .search-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    font-weight: 400;
    color: var(--text-primary);
    font-family: inherit;
    -webkit-user-select: text;
    user-select: text;
  }

  .search-input::placeholder {
    color: var(--text-tertiary);
  }

  /* Loading */
  .search-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 0;
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .search-spinner {
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--border-subtle);
    border-top-color: var(--text-secondary);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Results */
  .search-results {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px;
    -webkit-overflow-scrolling: touch;
  }

  .search-results::-webkit-scrollbar { width: 0; }

  .result-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 8px;
    border-radius: 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
    font-family: inherit;
    transition: background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .result-row:active {
    background: var(--border-subtle);
  }

  .result-thumb {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--bg-surface);
  }

  .result-info {
    flex: 1;
    min-width: 0;
  }

  .result-title {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }

  .result-artist {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 2px 0 0;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .result-dur {
    font-size: 11px;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .search-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .search-empty p { margin: 0; }
</style>
