<script lang="ts">
  /**
   * QueuePanel — Queue list for the mini player.
   * Premium monochrome design with clear remove buttons and reordering visuals.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { formatDuration, truncate } from '$lib/music/music-utils.js';
</script>

<div class="qp">
  <!-- ── Header ── -->
  <div class="qp-head">
    <div class="qp-head-left">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        style="opacity: 0.5;">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
      <span class="qp-label">Up Next</span>
      {#if playerStore.queue.length > 0}
        <span class="qp-count">{playerStore.queue.length} tracks</span>
      {/if}
    </div>
    {#if playerStore.queue.length > 0}
      <button class="qp-clear" onclick={() => playerStore.clearQueue()}>
        Clear all
      </button>
    {/if}
  </div>

  <!-- ── List ── -->
  <div class="qp-list">
    {#if playerStore.queue.length === 0}
      <div class="qp-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"
          style="opacity: 0.15;">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
        </svg>
        <span>Queue is empty</span>
        <span class="qp-empty-hint">Search for songs to add them here</span>
      </div>
    {:else}
      {#each playerStore.queue as track, idx (track.id + idx)}
        {@const isActive = idx === playerStore.queueIndex}
        <div
          class="qp-row"
          class:qp-row-on={isActive}
          role="button"
          tabindex="0"
          onclick={() => { playerStore.queueIndex = idx; playerStore.playTrack(track); }}
          onkeydown={(e) => { if (e.key === 'Enter') { playerStore.queueIndex = idx; playerStore.playTrack(track); } }}
        >
          <!-- Reorder handle -->
          <span class="qp-drag-handle" aria-hidden="true">
            <span></span><span></span>
          </span>

          <!-- Index / Equalizer -->
          <span class="qp-idx">
            {#if isActive && (playerStore.status === 'playing' || playerStore.status === 'loading')}
              <span class="qp-eq">
                <span></span><span></span><span></span><span></span>
              </span>
            {:else}
              {idx + 1}
            {/if}
          </span>

          <img class="qp-thumb" src={track.thumbnail} alt="" loading="lazy" />
          <div class="qp-info">
            <p class="qp-title">{truncate(track.title, 36)}</p>
            <p class="qp-artist">{truncate(track.artist, 22)}</p>
          </div>
          <span class="qp-dur">{formatDuration(track.duration)}</span>

          <!-- Remove button — always visible -->
          <button
            class="qp-del"
            onclick={(e) => { e.stopPropagation(); playerStore.removeFromQueue(idx); }}
            aria-label="Remove from queue"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .qp {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Header ── */
  .qp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 6px;
    flex-shrink: 0;
  }

  .qp-head-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .qp-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #fff);
  }

  .qp-count {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary, #555);
    font-variant-numeric: tabular-nums;
  }

  .qp-clear {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-tertiary, #666);
    background: var(--bg-surface, rgba(255,255,255,0.04));
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.05));
    padding: 5px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
    transition: background 120ms, color 120ms, border-color 120ms;
  }

  .qp-clear:hover {
    color: var(--text-secondary, #aaa);
    border-color: rgba(255,255,255,0.08);
  }

  .qp-clear:active {
    color: var(--text-primary, #fff);
    background: var(--border-subtle, rgba(255,255,255,0.08));
  }

  /* ── List ── */
  .qp-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px;
    -webkit-overflow-scrolling: touch;
  }

  .qp-list::-webkit-scrollbar { width: 0; }

  .qp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 56px;
    padding: 4px 6px 4px 4px;
    border-radius: 12px;
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary, #fff);
    font-family: inherit;
    transition: background 120ms, border-color 120ms;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }

  .qp-row:hover {
    background: var(--bg-surface, rgba(255,255,255,0.02));
    border-color: var(--border-subtle, rgba(255,255,255,0.03));
  }

  .qp-row:active {
    background: var(--border-subtle, rgba(255,255,255,0.06));
  }

  .qp-row-on {
    background: rgba(255,255,255,0.04);
    border-color: rgba(255,255,255,0.08);
  }

  /* ── Drag handle (visual reorder indicator) ── */
  .qp-drag-handle {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 14px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 150ms;
  }

  .qp-row:hover .qp-drag-handle {
    opacity: 0.3;
  }

  .qp-drag-handle span {
    display: block;
    width: 10px;
    height: 1.5px;
    border-radius: 1px;
    background: var(--text-tertiary, #555);
  }

  /* ── Index ── */
  .qp-idx {
    width: 20px;
    text-align: center;
    font-size: 11px;
    color: var(--text-tertiary, #555);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    flex-shrink: 0;
  }

  .qp-row-on .qp-idx {
    color: var(--text-primary, #fff);
  }

  /* ── Equalizer ── */
  .qp-eq {
    display: inline-flex;
    align-items: flex-end;
    gap: 1.5px;
    height: 14px;
  }

  .qp-eq span {
    display: block;
    width: 2.5px;
    background: var(--text-primary, #fff);
    border-radius: 2px;
    animation: eqB 0.9s ease-in-out infinite;
  }

  .qp-eq span:nth-child(1) { height: 35%; animation-delay: 0ms; }
  .qp-eq span:nth-child(2) { height: 80%; animation-delay: 150ms; }
  .qp-eq span:nth-child(3) { height: 100%; animation-delay: 300ms; }
  .qp-eq span:nth-child(4) { height: 55%; animation-delay: 120ms; }

  @keyframes eqB {
    0%, 100% { transform: scaleY(0.35); opacity: 0.7; }
    50% { transform: scaleY(1); opacity: 1; }
  }

  .qp-thumb {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--bg-surface, rgba(255,255,255,0.04));
  }

  .qp-info {
    flex: 1;
    min-width: 0;
  }

  .qp-title {
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
    color: var(--text-primary, #fff);
  }

  .qp-artist {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-tertiary, #555);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 1px 0 0;
  }

  .qp-dur {
    font-size: 10.5px;
    color: var(--text-tertiary, #555);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    flex-shrink: 0;
    margin-right: -2px;
  }

  /* ── Remove button ── */
  .qp-del {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-tertiary, #555);
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
    transition: background 120ms, color 120ms, border-color 120ms;
    -webkit-tap-highlight-color: transparent;
  }

  .qp-row:hover .qp-del {
    color: var(--text-secondary, #888);
    background: var(--bg-surface, rgba(255,255,255,0.03));
    border-color: var(--border-subtle, rgba(255,255,255,0.05));
  }

  .qp-del:hover {
    color: #ef4444 !important;
    background: rgba(239, 68, 68, 0.08) !important;
    border-color: rgba(239, 68, 68, 0.15) !important;
  }

  .qp-del:active {
    background: rgba(239, 68, 68, 0.14);
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.2);
  }

  /* ── Empty state ── */
  .qp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 32px 16px;
    color: var(--text-tertiary, #555);
  }

  .qp-empty > span {
    font-size: 12px;
    font-weight: 400;
  }

  .qp-empty-hint {
    font-size: 11px !important;
    color: var(--text-tertiary, #3a3a3a) !important;
    margin-top: -2px;
  }
</style>
