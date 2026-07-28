<script lang="ts">
  /**
   * QueuePanel — Queue list for the mini player.
   */

  import { playerStore } from '$lib/music/player-store.svelte.js';
  import { formatDuration, truncate } from '$lib/music/music-utils.js';
</script>

<div class="qp">
  <!-- ── Header ── -->
  <div class="qp-head">
    <span class="qp-label">Queue</span>
    <span class="qp-count">{playerStore.queue.length}</span>
    {#if playerStore.queue.length > 0}
      <button class="qp-clear" onclick={() => playerStore.clearQueue()}>Clear</button>
    {/if}
  </div>

  <!-- ── List ── -->
  <div class="qp-list">
    {#if playerStore.queue.length === 0}
      <div class="qp-empty">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
          style="opacity: 0.3;">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
        </svg>
        <span>No tracks queued</span>
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
          <span class="qp-idx">
            {#if isActive && (playerStore.status === 'playing' || playerStore.status === 'loading')}
              <span class="qp-eq">
                <span></span><span></span><span></span>
              </span>
            {:else}
              {idx + 1}
            {/if}
          </span>
          <img class="qp-thumb" src={track.thumbnail} alt="" loading="lazy" />
          <div class="qp-info">
            <p class="qp-title">{truncate(track.title, 42)}</p>
            <p class="qp-artist">{truncate(track.artist, 24)}</p>
          </div>
          <span class="qp-dur">{formatDuration(track.duration)}</span>
          <button
            class="qp-del"
            onclick={(e) => { e.stopPropagation(); playerStore.removeFromQueue(idx); }}
            aria-label="Remove from queue"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
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

  .qp-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px 6px;
    flex-shrink: 0;
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
    margin-left: auto;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary, #666);
    background: none;
    border: none;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  .qp-clear:active {
    color: var(--text-primary, #fff);
    background: var(--border-subtle, rgba(255,255,255,0.08));
  }

  .qp-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 6px;
    -webkit-overflow-scrolling: touch;
  }

  .qp-list::-webkit-scrollbar { width: 0; }

  .qp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
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

  .qp-row:active {
    background: var(--border-subtle, rgba(255,255,255,0.06));
  }

  .qp-row-on {
    background: rgba(255,255,255,0.04);
  }

  .qp-idx {
    width: 18px;
    text-align: center;
    font-size: 10.5px;
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
    height: 12px;
  }

  .qp-eq span {
    display: block;
    width: 2px;
    background: var(--text-primary, #fff);
    border-radius: 1px;
    animation: eqB 0.8s ease-in-out infinite;
  }

  .qp-eq span:nth-child(1) { height: 40%; animation-delay: 0ms; }
  .qp-eq span:nth-child(2) { height: 80%; animation-delay: 150ms; }
  .qp-eq span:nth-child(3) { height: 60%; animation-delay: 300ms; }

  @keyframes eqB {
    0%, 100% { transform: scaleY(0.5); }
    50% { transform: scaleY(1); }
  }

  .qp-thumb {
    width: 36px;
    height: 36px;
    border-radius: 8px;
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
  }

  .qp-del {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-tertiary, #555);
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
    transition: background 120ms, color 120ms;
    -webkit-tap-highlight-color: transparent;
  }

  .qp-del:active {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }

  /* ── Empty ── */
  .qp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 16px;
    color: var(--text-tertiary, #555);
  }

  .qp-empty span {
    font-size: 11.5px;
    font-weight: 400;
  }
</style>
