<script lang="ts">
  /**
   * QueuePanel — Compact queue list for the mini player.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { formatDuration, truncate } from '$lib/music/music-utils.js';

  let dragIdx: number | null = $state(null);
</script>

<div class="queue-panel">
  <div class="queue-header">
    <span class="queue-title">Queue</span>
    <span class="queue-count">{playerStore.queue.length} tracks</span>
    {#if playerStore.queue.length > 0}
      <button class="queue-clear" onclick={() => playerStore.clearQueue()}>Clear</button>
    {/if}
  </div>

  <div class="queue-list">
    {#if playerStore.queue.length === 0}
      <div class="queue-empty">
        <p>Queue is empty</p>
        <p class="queue-empty-sub">Search and add songs to play</p>
      </div>
    {:else}
      {#each playerStore.queue as track, idx (track.id)}
        <div
          class="queue-row"
          class:is-active={idx === playerStore.queueIndex}
          class:is-dragging={idx === dragIdx}
        >
          <span class="queue-num">
            {#if idx === playerStore.queueIndex && playerStore.status === 'playing'}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="4" height="18" rx="1"/>
                <rect x="17" y="3" width="4" height="18" rx="1"/>
              </svg>
            {:else}
              {idx + 1}
            {/if}
          </span>
          <img class="queue-thumb" src={track.thumbnail} alt="" loading="lazy" />
          <button
            class="queue-info"
            onclick={() => { playerStore.queueIndex = idx; playerStore.playTrack(track); }}
          >
            <p class="queue-track-title">{truncate(track.title, 45)}</p>
            <p class="queue-track-artist">{truncate(track.artist, 25)}</p>
          </button>
          <span class="queue-dur">{formatDuration(track.duration)}</span>
          <button
            class="queue-remove"
            onclick={(e) => { e.stopPropagation(); playerStore.removeFromQueue(idx); }}
            aria-label="Remove"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
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
  .queue-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .queue-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 8px;
    flex-shrink: 0;
  }

  .queue-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .queue-count {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-left: auto;
  }

  .queue-clear {
    font-size: 11px;
    color: var(--text-tertiary);
    background: none;
    border: none;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .queue-clear:active {
    color: var(--text-primary);
    background: var(--border-subtle);
  }

  .queue-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 6px;
    -webkit-overflow-scrolling: touch;
  }

  .queue-list::-webkit-scrollbar { width: 0; }

  .queue-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    transition: background 150ms ease;
  }

  .queue-row.is-active {
    background: var(--border-subtle);
  }

  .queue-row.is-dragging {
    opacity: 0.5;
  }

  .queue-num {
    width: 16px;
    text-align: center;
    font-size: 11px;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .queue-row.is-active .queue-num {
    color: var(--text-primary);
  }

  .queue-thumb {
    width: 36px;
    height: 36px;
    border-radius: 5px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--bg-surface);
  }

  .queue-info {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    padding: 2px 0;
    font-family: inherit;
    color: var(--text-primary);
  }

  .queue-track-title {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }

  .queue-track-artist {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 1px 0 0;
  }

  .queue-dur {
    font-size: 11px;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .queue-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 150ms, color 150ms;
  }

  .queue-remove:active {
    background: var(--border-subtle);
    color: var(--text-primary);
  }

  .queue-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 16px;
    text-align: center;
  }

  .queue-empty p {
    font-size: 13px;
    color: var(--text-tertiary);
    margin: 0;
  }

  .queue-empty-sub {
    font-size: 11px !important;
    margin-top: 4px !important;
    opacity: 0.7;
  }
</style>
