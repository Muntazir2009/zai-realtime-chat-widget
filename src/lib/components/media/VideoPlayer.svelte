<script lang="ts">
  import { Play } from 'lucide-svelte';

  interface Props {
    url: string;
    thumbnailUrl?: string | null;
    duration?: number;
    onVideoTap?: () => void;
  }

  let { url, thumbnailUrl, duration = 0, onVideoTap }: Props = $props();

  const durStr = $derived(duration > 0
    ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`
    : ''
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="video-thumb" onclick={onVideoTap}>
  {#if thumbnailUrl}
    <img src={thumbnailUrl} alt="Video" class="vt-poster" draggable="false" />
  {/if}
  <div class="vt-overlay"></div>
  <div class="vt-play-icon">
    <Play size={28} fill="white" />
  </div>
  {#if durStr}
    <span class="vt-duration">{durStr}</span>
  {/if}
</div>

<style>
  .video-thumb {
    position: relative;
    border-radius: var(--radius-lg, 16px);
    overflow: hidden;
    background: #111;
    min-height: 180px;
    max-height: 300px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .video-thumb:active { transform: scale(0.97); }

  .vt-poster {
    width: 100%;
    max-height: 300px;
    object-fit: cover;
    display: block;
  }

  .vt-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.2);
    pointer-events: none;
  }

  .vt-play-icon {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .vt-play-icon :global(svg) {
    color: white;
    filter: drop-shadow(0 2px 12px rgba(0,0,0,0.5));
    background: rgba(0,0,0,0.35);
    border-radius: 50%;
    padding: 10px;
  }

  .vt-duration {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0,0,0,0.7);
    color: white;
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
</style>