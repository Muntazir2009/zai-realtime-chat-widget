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
  <!-- Animated shimmer overlay -->
  <div class="gif-shimmer-overlay" aria-hidden="true"></div>

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

  <!-- Search bar with animated gradient border -->
  <div class="gif-search-wrap">
    <div class="gif-search-border">
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
            <div class="gif-skeleton">
              <div class="gif-skeleton-shine"></div>
            </div>
          {/each}
        </div>
      </div>
    {:else if error}
      <div class="gif-empty">
        <div class="gif-empty-icon-wrap">
          <span class="gif-empty-icon">⚡</span>
          <div class="gif-empty-icon-ring"></div>
        </div>
        <p class="gif-empty-text">{error}</p>
        <button class="gif-retry" onclick={() => fetchGifs(searchQuery.trim() || 'trending')}>Retry</button>
      </div>
    {:else if gifs.length === 0}
      <div class="gif-empty">
        <div class="gif-empty-icon-wrap">
          <span class="gif-empty-icon">🔍</span>
          <div class="gif-empty-icon-ring"></div>
        </div>
        <p class="gif-empty-text">No GIFs found</p>
        <p class="gif-empty-sub">Try a different search</p>
      </div>
    {:else}
      <div class="gif-grid-inner">
        {#each gifs as gif, i (gif.id)}
          <button
            class="gif-item"
            style="animation-delay: {Math.min(i * 30, 360)}ms"
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
            <div class="gif-skeleton">
              <div class="gif-skeleton-shine"></div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ─── Root ─── */
  .gif-picker-root {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 360px;
    background: color-mix(in srgb, var(--bg-surface) 60%, transparent);
    backdrop-filter: blur(24px) saturate(1.4);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
    border-top: 1px solid color-mix(in srgb, var(--color-primary) 15%, var(--border-subtle));
    overflow: hidden;
    z-index: 0;
  }

  /* ─── Shimmer overlay on root ─── */
  .gif-shimmer-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      120deg,
      transparent 0%,
      color-mix(in srgb, var(--color-primary) 3%, transparent) 40%,
      color-mix(in srgb, var(--color-primary) 6%, transparent) 50%,
      color-mix(in srgb, var(--color-primary) 3%, transparent) 60%,
      transparent 100%
    );
    background-size: 250% 100%;
    animation: rootShimmer 6s ease-in-out infinite;
    z-index: 1;
  }

  @keyframes rootShimmer {
    0%, 100% { background-position: 200% 0; }
    50% { background-position: -200% 0; }
  }

  /* ─── Chips ─── */
  .gif-chips {
    flex-shrink: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    z-index: 2;
    position: relative;
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
    gap: 5px;
    padding: 5px 12px;
    border-radius: var(--radius-pill);
    border: 1px solid color-mix(in srgb, var(--text-tertiary) 12%, transparent);
    background: color-mix(in srgb, var(--bg-elevated) 50%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
    animation: chipFadeIn 350ms ease both;
    position: relative;
    overflow: hidden;
  }

  .gif-chip::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    opacity: 0;
    background: radial-gradient(ellipse at center, color-mix(in srgb, var(--color-primary) 15%, transparent), transparent 70%);
    transition: opacity 250ms ease;
  }

  .gif-chip:hover::before { opacity: 1; }

  .gif-chip:active { transform: scale(0.92); }

  .gif-chip-active {
    color: var(--color-primary-foreground);
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 25%, var(--bg-elevated));
    box-shadow:
      0 0 12px color-mix(in srgb, var(--color-primary) 35%, transparent),
      0 0 24px color-mix(in srgb, var(--color-primary) 15%, transparent),
      inset 0 0 12px color-mix(in srgb, var(--color-primary) 10%, transparent);
    text-shadow: 0 0 8px color-mix(in srgb, var(--color-primary) 60%, transparent);
  }

  .gif-chip-active::before { opacity: 0; }

  .gif-chip-emoji { font-size: 13px; line-height: 1; position: relative; z-index: 1; }
  .gif-chip-label { line-height: 1; position: relative; z-index: 1; }

  @keyframes chipFadeIn {
    from { opacity: 0; transform: scale(0.85) translateY(6px); filter: blur(4px); }
    to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
  }

  /* ─── Search ─── */
  .gif-search-wrap {
    flex-shrink: 0;
    padding: 0 12px 8px;
    z-index: 2;
    position: relative;
  }

  /* Animated gradient border wrapper */
  .gif-search-border {
    position: relative;
    border-radius: var(--radius-md);
    padding: 1.5px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--text-tertiary) 20%, transparent),
      color-mix(in srgb, var(--text-tertiary) 10%, transparent) 40%,
      color-mix(in srgb, var(--text-tertiary) 20%, transparent)
    );
    transition: all 400ms ease;
    overflow: hidden;
  }

  .gif-search-border::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
    background: conic-gradient(
      from var(--search-angle, 0deg),
      var(--color-primary),
      color-mix(in srgb, var(--color-primary) 40%, transparent),
      transparent,
      transparent,
      color-mix(in srgb, var(--color-primary) 40%, transparent),
      var(--color-primary)
    );
    opacity: 0;
    transition: opacity 400ms ease;
    animation: rotateGradient 3s linear infinite;
    z-index: -1;
  }

  .gif-search-border:focus-within {
    background: var(--color-primary);
    box-shadow:
      0 0 16px color-mix(in srgb, var(--color-primary) 30%, transparent),
      0 0 32px color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .gif-search-border:focus-within::before {
    opacity: 1;
  }

  @keyframes rotateGradient {
    from { --search-angle: 0deg; }
    to { --search-angle: 360deg; }
  }

  @property --search-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }

  .gif-search-inner {
    display: flex;
    align-items: center;
    background: color-mix(in srgb, var(--input-bg) 80%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: calc(var(--radius-md) - 1.5px);
    transition: all 300ms ease;
  }

  .gif-search-border:focus-within .gif-search-inner {
    background: color-mix(in srgb, var(--input-bg) 60%, transparent);
  }

  .gif-search-icon {
    flex-shrink: 0;
    margin-left: 10px;
    color: var(--text-tertiary);
    transition: color 300ms ease;
  }

  .gif-search-border:focus-within .gif-search-icon {
    color: var(--color-primary);
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--color-primary) 50%, transparent));
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
    transition: color 300ms ease;
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
    transition: all 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .gif-search-clear:hover {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
  }

  /* ─── Grid ─── */
  .gif-grid {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 0 10px 10px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-primary) 20%, transparent) transparent;
    z-index: 2;
    position: relative;
  }

  .gif-grid::-webkit-scrollbar { width: 4px; }
  .gif-grid::-webkit-scrollbar-track { background: transparent; }
  .gif-grid::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
    border-radius: 2px;
  }

  .gif-grid-inner {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
  }

  /* ─── GIF item ─── */
  .gif-item {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    min-height: 80px;
    max-height: 130px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--input-bg) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-tertiary) 6%, transparent);
    cursor: pointer;
    transition:
      transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 300ms ease,
      border-color 300ms ease;
    -webkit-tap-highlight-color: transparent;
    animation: gifItemIn 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
    opacity: 0;
  }

  .gif-item:hover {
    transform: scale(1.04);
    border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
    box-shadow:
      0 0 12px color-mix(in srgb, var(--color-primary) 25%, transparent),
      0 4px 20px color-mix(in srgb, var(--bg-surface) 40%, transparent),
      0 0 1px color-mix(in srgb, var(--color-primary) 50%, transparent);
    z-index: 3;
  }

  .gif-item:active {
    transform: scale(0.95);
    transition-duration: 100ms;
  }

  .gif-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    min-height: 80px;
    transition: filter 300ms ease;
  }

  .gif-item:hover .gif-img {
    filter: brightness(1.1) saturate(1.15);
  }

  .gif-item-overlay {
    position: absolute;
    bottom: 0;
    right: 0;
    padding: 4px 6px;
    opacity: 0;
    transition: opacity 250ms ease;
  }

  .gif-item:active .gif-item-overlay,
  .gif-item:hover .gif-item-overlay {
    opacity: 1;
  }

  .gif-item-badge {
    font-size: 9px;
    font-weight: 800;
    color: white;
    background: color-mix(in srgb, var(--color-primary) 50%, rgba(0, 0, 0, 0.5));
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.06em;
    box-shadow:
      0 0 8px color-mix(in srgb, var(--color-primary) 40%, transparent),
      0 0 2px color-mix(in srgb, var(--color-primary) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  @keyframes gifItemIn {
    from {
      opacity: 0;
      transform: scale(0.88) translateY(8px);
      filter: blur(6px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
      filter: blur(0);
    }
  }

  /* ─── Skeleton ─── */
  .gif-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
  }

  .gif-skeleton {
    min-height: 90px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--input-bg) 50%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-tertiary) 4%, transparent);
    position: relative;
    overflow: hidden;
  }

  .gif-skeleton-shine {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      110deg,
      transparent 0%,
      color-mix(in srgb, var(--color-primary) 6%, transparent) 30%,
      color-mix(in srgb, var(--color-primary) 10%, transparent) 50%,
      color-mix(in srgb, var(--color-primary) 6%, transparent) 70%,
      transparent 100%
    );
    background-size: 250% 100%;
    animation: skeletonPulse 2s ease-in-out infinite;
  }

  @keyframes skeletonPulse {
    0% { background-position: 200% 0; opacity: 0.6; }
    50% { background-position: -100% 0; opacity: 1; }
    100% { background-position: -200% 0; opacity: 0.6; }
  }

  /* ─── Empty state ─── */
  .gif-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    animation: fadeIn 400ms ease both;
  }

  .gif-empty-icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    margin-bottom: 12px;
  }

  .gif-empty-icon {
    font-size: 30px;
    z-index: 1;
    animation: iconFloat 3s ease-in-out infinite;
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--color-primary) 30%, transparent));
  }

  .gif-empty-icon-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
    animation: ringPulse 2.5s ease-in-out infinite;
  }

  .gif-empty-icon-ring::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--color-primary) 8%, transparent);
    animation: ringPulse 2.5s ease-in-out infinite 0.4s;
  }

  @keyframes iconFloat {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-4px) scale(1.05); }
  }

  @keyframes ringPulse {
    0%, 100% { transform: scale(0.9); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 1; }
  }

  .gif-empty-text {
    font-size: 14px;
    color: var(--text-tertiary);
    font-weight: 500;
  }

  .gif-empty-sub {
    font-size: 12px;
    color: var(--text-tertiary);
    opacity: 0.7;
    margin-top: 4px;
  }

  .gif-retry {
    margin-top: 12px;
    padding: 6px 18px;
    border-radius: var(--radius-pill);
    border: 1.5px solid var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 250ms ease;
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-primary) 15%, transparent);
  }

  .gif-retry:hover {
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  .gif-retry:active {
    transform: scale(0.94);
    transition-duration: 100ms;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>