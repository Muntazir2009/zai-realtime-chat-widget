<script lang="ts">
  import { X, Play, Pause, Volume2, VolumeX, RotateCcw, SkipBack, SkipForward, Download } from 'lucide-svelte';

  interface Props {
    url: string;
    thumbnailUrl?: string | null;
    duration?: number;
    caption?: string;
    onClose: () => void;
  }

  let { url, thumbnailUrl, duration = 0, caption, onClose }: Props = $props();

  let videoEl: HTMLVideoElement | null = $state(null);
  let isPlaying = $state(false);
  let isMuted = $state(false);
  let currentTime = $state(0);
  let totalDuration = $state(duration);
  let isLoading = $state(true);
  let showControls = $state(true);
  let buffered = $state(0);
  let playbackRate = $state(1);
  let controlsTimer: ReturnType<typeof setTimeout> | null = null;
  let seekDragging = $state(false);
  let seekDragPct = $state(0);

  const progress = $derived(totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0);
  const bufferedPct = $derived(totalDuration > 0 ? (buffered / totalDuration) * 100 : 0);
  const displayProgress = $derived(seekDragging ? seekDragPct : progress);
  const speedLabel = $derived(playbackRate === 1 ? '' : `${playbackRate}x`);

  function fmt(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function togglePlay() {
    if (!videoEl) return;
    if (isPlaying) videoEl.pause();
    else videoEl.play();
  }

  function toggleMute() {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    isMuted = videoEl.muted;
  }

  function cycleSpeed() {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const idx = speeds.indexOf(playbackRate);
    playbackRate = speeds[(idx + 1) % speeds.length];
    if (videoEl) videoEl.playbackRate = playbackRate;
  }

  function skip(secs: number) {
    if (!videoEl) return;
    videoEl.currentTime = Math.max(0, Math.min(videoEl.currentTime + secs, totalDuration));
  }

  function resetVideo() {
    if (!videoEl) return;
    videoEl.currentTime = 0;
    videoEl.play();
  }

  // Seek
  function seekFromEvent(e: MouseEvent | TouchEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    seekDragPct = (x / rect.width) * 100;
  }

  function onSeekStart(e: MouseEvent) {
    seekDragging = true;
    seekFromEvent(e, e.currentTarget as HTMLElement);
  }

  function onSeekMove(e: MouseEvent) {
    if (!seekDragging) return;
    seekFromEvent(e, e.currentTarget as HTMLElement);
  }

  function onSeekEnd() {
    if (!seekDragging) return;
    seekDragging = false;
    if (videoEl) videoEl.currentTime = (seekDragPct / 100) * totalDuration;
  }

  // Touch seek
  let seekBarEl: HTMLDivElement | null = $state(null);
  function onSeekTouchStart(e: TouchEvent) {
    seekDragging = true;
    if (seekBarEl) seekFromEvent(e, seekBarEl);
  }
  function onSeekTouchMove(e: TouchEvent) {
    if (!seekDragging || !seekBarEl) return;
    seekFromEvent(e, seekBarEl);
  }
  function onSeekTouchEnd() {
    onSeekEnd();
  }

  function showControlsTemporarily() {
    showControls = true;
    if (controlsTimer) clearTimeout(controlsTimer);
    if (isPlaying) controlsTimer = setTimeout(() => { showControls = false; }, 3000);
  }

  function handleVideoClick() {
    if (!showControls) { showControlsTemporarily(); return; }
    togglePlay();
    showControlsTemporarily();
  }

  async function handleDownload() {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch { window.open(url, '_blank'); }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowRight') skip(5);
    if (e.key === 'ArrowLeft') skip(-5);
    if (e.key === 'm') toggleMute();
  }

  // Drag listeners for seek bar
  $effect(() => {
    if (!seekDragging) return;
    const onMove = (e: MouseEvent) => { if (seekBarEl) seekFromEvent(e, seekBarEl); };
    const onUp = () => onSeekEnd();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  });

  $effect(() => {
    const el = videoEl;
    if (!el) return;
    const onTimeUpdate = () => { if (!seekDragging) currentTime = el!.currentTime; };
    const onDurationChange = () => { totalDuration = el!.duration || duration; };
    const onPlay = () => { isPlaying = true; showControlsTemporarily(); };
    const onPause = () => { isPlaying = false; showControls = true; if (controlsTimer) clearTimeout(controlsTimer); };
    const onEnded = () => { isPlaying = false; showControls = true; if (controlsTimer) clearTimeout(controlsTimer); };
    const onWaiting = () => { isLoading = true; };
    const onCanPlay = () => { isLoading = false; };
    const onProgress = () => { if (el!.buffered.length > 0) buffered = el!.buffered.end(el!.buffered.length - 1); };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('progress', onProgress);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('progress', onProgress);
      el.pause();
      el.src = '';
    };
  });

  $effect(() => {
    document.addEventListener('keydown', handleKeydown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = '';
    };
  });
</script>

<div
  class="vl-backdrop"
  onkeydown={handleKeydown}
  onmousemove={showControlsTemporarily}
  role="dialog"
  tabindex="0"
>
  <!-- Video -->
  <video
    bind:this={videoEl}
    src={url}
    poster={thumbnailUrl || undefined}
    preload="auto"
    playsinline
    autoplay
    onclick={handleVideoClick}
    class="vl-video"
  ></video>

  <!-- Loading -->
  {#if isLoading && isPlaying}
    <div class="vl-loading">
      <div class="vl-spinner"></div>
    </div>
  {/if}

  <!-- Center play (paused) -->
  {#if !isPlaying && !isLoading}
    <div class="vl-center-play" onclick={togglePlay}>
      <Play size={48} fill="white" />
    </div>
  {/if}

  <!-- Controls overlay -->
  {#if showControls}
    <!-- Top bar -->
    <div class="vl-top safe-top">
      <button class="vl-btn" onclick={onClose} aria-label="Close">
        <X size={22} />
      </button>
      <div class="vl-top-center">
        {#if caption}
          <span class="vl-caption">{caption}</span>
        {/if}
      </div>
      <button class="vl-btn" onclick={handleDownload} aria-label="Download">
        <Download size={20} />
      </button>
    </div>

    <!-- Bottom -->
    <div class="vl-bottom safe-bottom">
      <!-- Seek bar -->
      <div
        class="vl-seek-bar"
        bind:this={seekBarEl}
        onmousedown={onSeekStart}
        ontouchstart={onSeekTouchStart}
        ontouchmove={onSeekTouchMove}
        ontouchend={onSeekTouchEnd}
      >
        <div class="vl-seek-buffered" style="width: {bufferedPct}%;"></div>
        <div class="vl-seek-progress" style="width: {displayProgress}%;"></div>
        <div class="vl-seek-thumb" style="left: {displayProgress}%; transform: translate(-50%, -50%) scale({seekDragging ? 1.3 : 1});"></div>
      </div>

      <!-- Buttons -->
      <div class="vl-btn-row">
        <button class="vl-btn" onclick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {#if isPlaying}
            <Pause size={22} fill="currentColor" />
          {:else}
            <Play size={22} fill="currentColor" style="margin-left: 2px;" />
          {/if}
        </button>

        <button class="vl-btn" onclick={() => skip(-10)} aria-label="Rewind 10s">
          <SkipBack size={20} />
        </button>

        <button class="vl-btn" onclick={() => skip(10)} aria-label="Forward 10s">
          <SkipForward size={20} />
        </button>

        <span class="vl-time">{fmt(seekDragging ? (seekDragPct / 100) * totalDuration : currentTime)} / {fmt(totalDuration)}</span>

        <div class="vl-spacer"></div>

        {#if speedLabel}
          <button class="vl-btn vl-speed" onclick={cycleSpeed}>{speedLabel}</button>
        {/if}

        <button class="vl-btn" onclick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
          {#if isMuted}
            <VolumeX size={20} />
          {:else}
            <Volume2 size={20} />
          {/if}
        </button>

        <button class="vl-btn" onclick={resetVideo} aria-label="Replay">
          <RotateCcw size={18} />
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .vl-backdrop {
    position: fixed;
    inset: 0;
    z-index: 110;
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    animation: vlFadeIn 200ms ease both;
    user-select: none;
    -webkit-user-select: none;
  }

  @keyframes vlFadeIn { from { opacity: 0; } to { opacity: 1; } }

  .vl-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }

  .vl-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    pointer-events: none;
  }

  .vl-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255,255,255,0.25);
    border-top-color: white;
    border-radius: 50%;
    animation: vlSpin 0.7s linear infinite;
  }
  @keyframes vlSpin { to { transform: rotate(360deg); } }

  .vl-center-play {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 4;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .vl-center-play :global(svg) {
    filter: drop-shadow(0 4px 16px rgba(0,0,0,0.5));
    color: white;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .vl-center-play:active :global(svg) { transform: scale(0.85); }

  /* Top bar */
  .vl-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    height: 56px;
    min-height: 56px;
    background: linear-gradient(rgba(0,0,0,0.5), transparent);
    z-index: 10;
    pointer-events: auto;
  }

  .vl-top-center {
    flex: 1;
    display: flex;
    justify-content: center;
    min-width: 0;
  }

  .vl-caption {
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 60%;
  }

  .vl-btn {
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.12);
    color: white;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    flex-shrink: 0;
  }
  .vl-btn:active { transform: scale(0.88); background: rgba(255,255,255,0.25); }

  /* Bottom */
  .vl-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
    padding: 24px 12px 8px;
    z-index: 10;
    pointer-events: auto;
  }

  .vl-seek-bar {
    position: relative;
    width: 100%;
    height: 24px;
    display: flex;
    align-items: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .vl-seek-buffered {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.2);
  }

  .vl-seek-progress {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 4px;
    border-radius: 2px;
    background: var(--color-primary, #22c55e);
    transition: width 0.05s linear;
  }

  .vl-seek-thumb {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-primary, #22c55e);
    box-shadow: 0 0 6px rgba(0,0,0,0.4);
    transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
  }

  .vl-btn-row {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 4px;
  }

  .vl-spacer { flex: 1; }

  .vl-time {
    font-size: 12px;
    color: rgba(255,255,255,0.8);
    font-variant-numeric: tabular-nums;
    margin-left: 4px;
  }

  .vl-speed {
    font-size: 12px;
    font-weight: 700;
    border-radius: 8px;
    padding: 0 8px;
    background: rgba(255,255,255,0.15);
  }
</style>