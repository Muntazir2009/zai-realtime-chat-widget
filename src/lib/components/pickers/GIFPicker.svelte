<script lang="ts">
  interface Props {
    onGifSelect: (gifUrl: string) => void;
  }
  let { onGifSelect }: Props = $props();

  let searchQuery = $state('');
  let gifs = $state<Array<{id: string; url: string; preview: string; title: string}>>([]);
  let categories = $state<Array<{name: string; emoji: string; query: string}>>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let activeCategory = $state('Trending');
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let offset = $state(0);
  let hasMore = $state(true);
  let error = $state('');
  let gridEl: HTMLDivElement | undefined = $state();

  const categoriesWithAll = $derived([
    { name: 'All', emoji: '✨', query: 'trending' },
    ...categories,
  ]);

  async function fetchGifs(query: string, reset = true) {
    if (reset) {
      loading = true;
      offset = 0;
      hasMore = true;
    } else {
      loadingMore = true;
    }

    error = '';
    try {
      const params = new URLSearchParams({ q: query, limit: '20', offset: String(offset) });
      const res = await fetch(`/api/gifs/search?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();

      if (reset) {
        gifs = data.gifs || [];
        categories = data.categories || [];
      } else {
        gifs = [...gifs, ...(data.gifs || [])];
      }
      hasMore = gifs.length < (data.total ?? 0) && (data.gifs || []).length >= 20;
    } catch (err) {
      error = 'Failed to load GIFs';
      console.error('GIF fetch error:', err);
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  // Initial load
  $effect(() => {
    fetchGifs('trending');
  });

  function handleSearch(value: string) {
    searchQuery = value;
    if (searchDebounce) clearTimeout(searchDebounce);
    if (!value.trim()) {
      activeCategory = 'Trending';
      fetchGifs('trending');
      return;
    }
    searchDebounce = setTimeout(() => {
      activeCategory = '';
      fetchGifs(value.trim());
    }, 300);
  }

  function selectCategory(cat: { name: string; query: string }) {
    searchQuery = '';
    activeCategory = cat.name;
    fetchGifs(cat.query);
  }

  function loadMore() {
    if (loading || loadingMore || !hasMore) return;
    const query = searchQuery.trim() || (activeCategory === 'All' ? 'trending' :
      categories.find(c => c.name === activeCategory)?.query || 'trending');
    offset += 20;
    fetchGifs(query, false);
  }

  function handleScroll() {
    if (!gridEl) return;
    const { scrollTop, scrollHeight, clientHeight } = gridEl;
    if (scrollHeight - scrollTop - clientHeight < 120) {
      loadMore();
    }
  }

  function handleSelect(url: string) {
    onGifSelect(url);
  }
</script>

<div class="gif-picker-root">
  <!-- Category chips -->
  <div class="gif-chips">
    <div class="gif-chips-inner">
      {#each categoriesWithAll as cat (cat.name)}
        <button
          class="gif-chip"
          class:gif-chip-active={activeCategory === cat.name}
          onclick={() => selectCategory(cat)}
        >
          <span class="gif-chip-emoji">{cat.emoji}</span>
          <span class="gif-chip-label">{cat.name}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Search bar -->
  <div class="gif-search-wrap">
    <div class="gif-search-inner">
      <svg class="gif-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input
        type="text"
        placeholder="Search GIFs..."
        class="gif-search-input"
        value={searchQuery}
        oninput={(e) => handleSearch((e.target as HTMLInputElement).value)}
      />
      {#if searchQuery}
        <button class="gif-search-clear" onclick={() => handleSearch('')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- GIF Grid -->
  <div
    bind:this={gridEl}
    class="gif-grid"
    onscroll={handleScroll}
  >
    {#if loading}
      <div class="gif-loading">
        <div class="gif-skeleton-grid">
          {#each Array(12) as _}
            <div class="gif-skeleton"></div>
          {/each}
        </div>
      </div>
    {:else if error}
      <div class="gif-empty">
        <p class="gif-empty-text">{error}</p>
        <button class="gif-retry" onclick={() => fetchGifs(searchQuery.trim() || 'trending')}>Retry</button>
      </div>
    {:else if gifs.length === 0}
      <div class="gif-empty">
        <p class="gif-empty-icon">🔍</p>
        <p class="gif-empty-text">No GIFs found</p>
        <p class="gif-empty-sub">Try a different search</p>
      </div>
    {:else}
      <div class="gif-grid-inner">
        {#each gifs as gif (gif.id)}
          <button
            class="gif-item"
            onclick={() => handleSelect(gif.url)}
            aria-label="Send GIF: {gif.title}"
          >
            <img
              src={gif.preview || gif.url}
              alt={gif.title}
              class="gif-img"
              loading="lazy"
            />
            <div class="gif-item-overlay">
              <span class="gif-item-badge">GIF</span>
            </div>
          </button>
        {/each}

        {#if loadingMore}
          {#each Array(6) as _}
            <div class="gif-skeleton"></div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .gif-picker-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 320px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border-subtle);
    overflow: hidden;
  }

  /* Chips */
  .gif-chips {
    flex-shrink: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .gif-chips::-webkit-scrollbar { display: none; }

  .gif-chips-inner {
    display: flex;
    gap: 6px;
    padding: 8px 12px 6px;
    min-width: min-content;
  }

  .gif-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: var(--radius-pill);
    border: 1.5px solid var(--border-subtle);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
    animation: chipFadeIn 300ms ease both;
  }

  .gif-chip:active { transform: scale(0.93); }

  .gif-chip-active {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  .gif-chip-emoji { font-size: 13px; line-height: 1; }
  .gif-chip-label { line-height: 1; }

  @keyframes chipFadeIn {
    from { opacity: 0; transform: scale(0.9) translateY(4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* Search */
  .gif-search-wrap {
    flex-shrink: 0;
    padding: 0 12px 8px;
  }

  .gif-search-inner {
    position: relative;
    display: flex;
    align-items: center;
    background: var(--input-bg);
    border: 1.5px solid var(--border-subtle);
    border-radius: var(--radius-md);
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }

  .gif-search-inner:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .gif-search-icon {
    flex-shrink: 0;
    margin-left: 10px;
    color: var(--text-tertiary);
  }

  .gif-search-input {
    flex: 1;
    min-height: 36px;
    padding: 0 8px;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    color: var(--text-primary);
    font-family: var(--font-sans, inherit);
  }

  .gif-search-input::placeholder {
    color: var(--text-tertiary);
  }

  .gif-search-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-right: 4px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .gif-search-clear:hover { background: var(--input-bg); color: var(--text-primary); }

  /* Grid */
  .gif-grid {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 0 8px 8px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-tertiary) 20%, transparent) transparent;
  }

  .gif-grid::-webkit-scrollbar { width: 4px; }
  .gif-grid::-webkit-scrollbar-track { background: transparent; }
  .gif-grid::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-tertiary) 20%, transparent);
    border-radius: 2px;
  }

  .gif-grid-inner {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  /* GIF item */
  .gif-item {
    position: relative;
    border-radius: var(--radius-sm);
    overflow: hidden;
    min-height: 80px;
    max-height: 130px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--input-bg);
    border: none;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
    animation: gifItemIn 250ms ease both;
  }

  .gif-item:active { transform: scale(0.94); }

  .gif-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    min-height: 80px;
  }

  .gif-item-overlay {
    position: absolute;
    bottom: 0;
    right: 0;
    padding: 3px 6px;
    opacity: 0;
    transition: opacity 200ms ease;
  }

  .gif-item:active .gif-item-overlay,
  .gif-item:hover .gif-item-overlay {
    opacity: 1;
  }

  .gif-item-badge {
    font-size: 9px;
    font-weight: 800;
    color: white;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    padding: 2px 5px;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }

  @keyframes gifItemIn {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }

  /* Loading skeleton */
  .gif-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .gif-skeleton {
    min-height: 90px;
    border-radius: var(--radius-sm);
    background: linear-gradient(110deg, var(--input-bg) 30%, color-mix(in srgb, var(--input-bg) 70%, var(--text-tertiary)) 50%, var(--input-bg) 70%);
    background-size: 200% 100%;
    animation: gifShimmer 1.5s infinite linear;
  }

  @keyframes gifShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* Empty state */
  .gif-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    animation: fadeIn 300ms ease both;
  }

  .gif-empty-icon { font-size: 32px; margin-bottom: 8px; }
  .gif-empty-text { font-size: 14px; color: var(--text-tertiary); font-weight: 500; }
  .gif-empty-sub { font-size: 12px; color: var(--text-tertiary); opacity: 0.7; margin-top: 4px; }

  .gif-retry {
    margin-top: 12px;
    padding: 6px 16px;
    border-radius: var(--radius-pill);
    border: 1.5px solid var(--color-primary);
    background: transparent;
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 200ms ease;
  }

  .gif-retry:active { transform: scale(0.95); background: color-mix(in srgb, var(--color-primary) 10%, transparent); }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>