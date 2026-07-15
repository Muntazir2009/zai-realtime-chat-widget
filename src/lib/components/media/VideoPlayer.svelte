<script lang="ts">
  import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw } from 'lucide-svelte';

  interface Props {
    url: string;
    thumbnailUrl?: string | null;
    duration?: number;
    onVideoTap?: () => void;
  }

  let { url, thumbnailUrl, duration = 0, onVideoTap }: Props = $props();

  let videoEl: HTMLVideoElement | null = $state(null);
  let isPlaying = $state(false);
  let isMuted = $state(false);
  let currentTime = $state(0);
  let totalDuration = $state(duration);
  let isLoading = $state(true);
  let showControls = $state(true);
  let isFullscreen = $state(false);
  let controlsTimer: ReturnType<typeof setTimeout> | null = null;
  let buffered = $state(0);
  let playbackRate = $state(1);

  const progress = $derived(totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0);
  const bufferedPct = $derived(totalDuration > 0 ? (buffered / totalDuration) * 100 : 0);
  const speedLabel = $derived(playbackRate === 1 ? '' : `${playbackRate}x`);

  function fmt(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function togglePlay() {
    if (!videoEl) return;
    if (isPlaying) {
      videoEl.pause();
    } else {
      videoEl.play();
    }
  }

  function toggleMute() {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    isMuted = videoEl.muted;
  }

  function handleSeek(e: MouseEvent) {
    if (!videoEl) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    videoEl.currentTime = pct * totalDuration;
    currentTime = videoEl.currentTime;
  }

  function cycleSpeed() {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const idx = speeds.indexOf(playbackRate);
    playbackRate = speeds[(idx + 1) % speeds.length];
    if (videoEl) videoEl.playbackRate = playbackRate;
  }

  function toggleFullscreen() {
    if (!videoEl) return;
    if (!document.fullscreenElement) {
      videoEl.requestFullscreen?.();
      isFullscreen = true;
    } else {
      document.exitFullscreen?.();
      isFullscreen = false;
    }
  }

  function resetVideo() {
    if (!videoEl) return;
    videoEl.currentTime = 0;
    videoEl.play();
  }

  function showControlsTemporarily() {
    showControls = true;
    if (controlsTimer) clearTimeout(controlsTimer);
    if (isPlaying) {
      controlsTimer = setTimeout(() => { showControls = false; }, 3000);
    }
  }

  function handleVideoClick() {
    if (!showControls) {
      showControlsTemporarily();
      return;
    }
    togglePlay();
    showControlsTemporarily();
  }

  $effect(() => {
    const el = videoEl;
    if (!el) return;

    function onTimeUpdate() { currentTime = el!.currentTime; }
    function onDurationChange() { totalDuration = el!.duration || duration; }
    function onPlay() { isPlaying = true; showControlsTemporarily(); }
    function onPause() { isPlaying = false; showControls = true; if (controlsTimer) clearTimeout(controlsTimer); }
    function onEnded() { isPlaying = false; showControls = true; if (controlsTimer) clearTimeout(controlsTimer); }
    function onWaiting() { isLoading = true; }
    function onCanPlay() { isLoading = false; }
    function onProgress() {
      if (el!.buffered.length > 0) {
        buffered = el!.buffered.end(el!.buffered.length - 1);
      }
    }
    function onFullscreenChange() { isFullscreen = !!document.fullscreenElement; }

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('progress', onProgress);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('progress', onProgress);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="video-player"
  onmousemove={showControlsTemporarily}
  ontouchstart={showControlsTemporarily}
>
  <video
    bind:this={videoEl}
    src={url}
    poster={thumbnailUrl || undefined}
    preload="metadata"
    playsinline
    onclick={handleVideoClick}
    style="width: 100%; display: block; border-radius: var(--radius-lg, 16px);"
  ></video>

  <!-- Loading spinner overlay -->
  {#if isLoading && isPlaying}
    <div class="vp-loading">
      <div class="vp-spinner"></div>
    </div>
  {/if}

  <!-- Center play button (when paused) -->
  {#if !isPlaying && !isLoading}
    <div class="vp-center-play" onclick={togglePlay}>
      <Play size={32} fill="white" />
    </div>
  {/if}

  <!-- Controls overlay -->
  {#if showControls}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="vp-controls">
      <!-- Bottom bar -->
      <div class="vp-bottom">
        <!-- Seek bar -->
        <div class="vp-seek-bar" onclick={handleSeek}>
          <div class="vp-buffered" style="width: {bufferedPct}%;"></div>
          <div class="vp-progress" style="width: {progress}%;"></div>
          <div class="vp-thumb" style="left: {progress}%;"></div>
        </div>

        <!-- Buttons row -->
        <div class="vp-btn-row">
          <button class="vp-btn" onclick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {#if isPlaying}
              <Pause size={18} fill="currentColor" />
            {:else}
              <Play size={18} fill="currentColor" />
            {/if}
          </button>

          <span class="vp-time">{fmt(currentTime)} / {fmt(totalDuration)}</span>

          <div class="vp-spacer"></div>

          {#if speedLabel}
            <button class="vp-btn vp-speed" onclick={cycleSpeed} aria-label="Playback speed">
              {speedLabel}
            </button>
          {/if}

          <button class="vp-btn" onclick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
            {#if isMuted}
              <VolumeX size={18} />
            {:else}
              <Volume2 size={18} />
            {/if}
          </button>

          <button class="vp-btn" onclick={resetVideo} aria-label="Replay">
            <RotateCcw size={16} />
          </button>

          <button class="vp-btn" onclick={toggleFullscreen} aria-label="Fullscreen">
            {#if isFullscreen}
              <Minimize size={18} />
            {:else}
              <Maximize size={18} />
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .video-player {
    position: relative;
    border-radius: var(--radius-lg, 16px);
    overflow: hidden;
    background: #000;
    min-height: 200px;
    max-height: 360px;
  }

  video {
    max-height: 360px;
    object-fit: contain;
    background: #000;
  }

  .vp-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.3);
    z-index: 2;
  }

  .vp-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: vpSpin 0.8s linear infinite;
  }

  @keyframes vpSpin {
    to { transform: rotate(360deg); }
  }

  .vp-center-play {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .vp-center-play :global(svg) {
    filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
    color: white;
  }

  .vp-controls {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    pointer-events: none;
  }

  .vp-bottom {
    pointer-events: auto;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
    padding: 20px 10px 8px;
  }

  .vp-seek-bar {
    position: relative;
    width: 100%;
    height: 20px;
    display: flex;
    align-items: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .vp-buffered {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 3px;
    border-radius: 2px;
    background: rgba(255,255,255,0.25);
    transition: width 0.2s ease;
  }

  .vp-progress {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 3px;
    border-radius: 2px;
    background: var(--color-primary, #22c55e);
    transition: width 0.1s linear;
  }

  .vp-thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-primary, #22c55e);
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
    transition: left 0.1s linear;
  }

  .vp-btn-row {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 2px;
  }

  .vp-spacer {
    flex: 1;
  }

  .vp-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    border: none;
    background: transparent;
    color: white;
    cursor: pointer;
    border-radius: 50%;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }

  .vp-btn:active {
    transform: scale(0.88);
    background: rgba(255,255,255,0.15);
  }

  .vp-speed {
    font-size: 11px;
    font-weight: 700;
    border-radius: 8px;
    padding: 0 6px;
    background: rgba(255,255,255,0.15);
  }

  .vp-time {
    font-size: 11px;
    color: rgba(255,255,255,0.8);
    font-variant-numeric: tabular-nums;
    margin-left: 4px;
    user-select: none;
    -webkit-user-select: none;
  }
</style>