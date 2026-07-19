<script lang="ts">
  import { Play, Pause, SkipForward, SkipBack, RotateCcw } from 'lucide-svelte';

  interface Props {
    url: string;
    duration: number;
  }

  let { url, duration: initDuration }: Props = $props();

  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(initDuration);
  let audioEl: HTMLAudioElement | null = $state(null);
  let isLoading = $state(false);
  let playbackRate = $state(1);
  let isDragging = $state(false);
  let dragPct = $state(0);
  let seekBarEl: HTMLDivElement | null = $state(null);

  const formattedDuration = $derived(formatTime(duration));
  const formattedCurrent = $derived(formatTime(isDragging ? (dragPct / 100) * duration : currentTime));
  const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
  const displayProgress = $derived(isDragging ? dragPct : progress);
  const speedLabel = $derived(playbackRate === 1 ? '1x' : `${playbackRate}x`);

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function togglePlay() {
    if (!audioEl) {
      audioEl = new Audio(url);
      audioEl.addEventListener('timeupdate', () => {
        if (!isDragging) currentTime = audioEl?.currentTime || 0;
      });
      audioEl.addEventListener('ended', () => {
        isPlaying = false;
        currentTime = 0;
      });
      audioEl.addEventListener('loadedmetadata', () => {
        duration = audioEl?.duration || duration;
      });
      audioEl.addEventListener('waiting', () => { isLoading = true; });
      audioEl.addEventListener('canplay', () => { isLoading = false; });
      audioEl.addEventListener('playing', () => { isLoading = false; });
    }

    if (isPlaying) {
      audioEl.pause();
      isPlaying = false;
    } else {
      audioEl.playbackRate = playbackRate;
      audioEl.play();
      isPlaying = true;
    }
  }

  function seekTo(pct: number) {
    if (!audioEl) return;
    const time = Math.max(0, Math.min((pct / 100) * duration, duration));
    audioEl.currentTime = time;
    currentTime = time;
  }

  function handleSeekStart(e: MouseEvent | TouchEvent) {
    isDragging = true;
    updateDrag(e);
  }

  function handleSeekMove(e: MouseEvent | TouchEvent) {
    if (!isDragging || !seekBarEl) return;
    updateDrag(e);
  }

  function handleSeekEnd() {
    if (!isDragging) return;
    isDragging = false;
    seekTo(dragPct);
  }

  function updateDrag(e: MouseEvent | TouchEvent) {
    if (!seekBarEl) return;
    const rect = seekBarEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    dragPct = (x / rect.width) * 100;
  }

  function skip(secs: number) {
    if (!audioEl) return;
    audioEl.currentTime = Math.max(0, Math.min(audioEl.currentTime + secs, duration));
  }

  function cycleSpeed() {
    const speeds = [0.5, 1, 1.5, 2];
    const idx = speeds.indexOf(playbackRate);
    playbackRate = speeds[(idx + 1) % speeds.length];
    if (audioEl) audioEl.playbackRate = playbackRate;
  }

  function replay() {
    if (!audioEl) return;
    audioEl.currentTime = 0;
    currentTime = 0;
    if (!isPlaying) togglePlay();
  }

  function handleKeySeek(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') skip(5);
    else if (e.key === 'ArrowLeft') skip(-5);
  }

  // Cleanup
  $effect(() => {
    return () => {
      if (audioEl) {
        audioEl.pause();
        audioEl.src = '';
        audioEl = null;
      }
    };
  });

  // Drag listeners on window
  $effect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => handleSeekMove(e);
    const onUp = () => handleSeekEnd();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });
</script>

<div class="audio-player">
  <!-- Play/Pause -->
  <button
    class="ap-play-btn"
    onclick={togglePlay}
    aria-label={isPlaying ? 'Pause' : 'Play'}
  >
    {#if isLoading && isPlaying}
      <div class="ap-mini-spin"></div>
    {:else if isPlaying}
      <Pause size={18} fill="currentColor" />
    {:else}
      <Play size={18} fill="currentColor" style="margin-left: 2px;" />
    {/if}
  </button>

  <!-- Seek bar + wave + time -->
  <div class="ap-center">
    <!-- Waveform behind seek bar -->
    <div
      class="ap-waveform"
      bind:this={seekBarEl}
      onmousedown={handleSeekStart}
      ontouchstart={handleSeekStart}
      ontouchmove={handleSeekMove}
      ontouchend={handleSeekEnd}
      role="slider"
      tabindex="0"
      aria-label="Audio progress"
      aria-valuenow={currentTime}
      aria-valuemin={0}
      aria-valuemax={duration}
      onkeydown={handleKeySeek}
    >
      {#each Array(28) as _, i}
        <span
          class="ap-wave-bar"
          style="
            left: {(i / 28) * 100}%;
            height: {20 + Math.sin(i * 0.6) * 55 + Math.cos(i * 1.1) * 25}%;
            background: {i / 28 <= displayProgress / 100 ? 'var(--color-primary)' : 'var(--text-tertiary)'};
            opacity: {i / 28 <= displayProgress / 100 ? 1 : 0.5};
          "
        ></span>
      {/each}
      <!-- Seek thumb -->
      <div class="ap-seek-thumb" style="left: {displayProgress}%;" class:ap-seek-thumb-active={isDragging}></div>
    </div>

    <!-- Time row -->
    <div class="ap-time-row">
      <span class="ap-time">{formattedCurrent}</span>
      <span class="ap-time ap-time-dur">{formattedDuration}</span>
    </div>
  </div>

  <!-- Skip / Speed / Replay -->
  <div class="ap-right">
    <button class="ap-sm-btn" onclick={() => skip(-10)} aria-label="Rewind 10s">
      <SkipBack size={14} />
    </button>
    <button class="ap-sm-btn ap-speed-btn" class:ap-speed-active={playbackRate !== 1} onclick={cycleSpeed} aria-label="Playback speed">
      {speedLabel}
    </button>
    <button class="ap-sm-btn" onclick={replay} aria-label="Replay">
      <RotateCcw size={13} />
    </button>
    <button class="ap-sm-btn" onclick={() => skip(10)} aria-label="Forward 10s">
      <SkipForward size={14} />
    </button>
  </div>
</div>

<style>
  .audio-player {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    max-width: 300px;
  }

  .ap-play-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    min-width: 42px;
    border-radius: 50%;
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    cursor: pointer;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease;
    box-shadow: 0 2px 10px color-mix(in srgb, var(--color-primary) 35%, transparent);
  }
  .ap-play-btn:active { transform: scale(0.88); }

  .ap-mini-spin {
    width: 16px;
    height: 16px;
    border: 2px solid color-mix(in srgb, var(--color-primary-foreground) 30%, transparent);
    border-top-color: var(--color-primary-foreground);
    border-radius: 50%;
    animation: apSpin 0.7s linear infinite;
  }
  @keyframes apSpin { to { transform: rotate(360deg); } }

  .ap-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .ap-waveform {
    position: relative;
    height: 32px;
    display: flex;
    align-items: center;
    cursor: pointer;
    border-radius: var(--radius-sm, 6px);
    padding: 0 2px;
    -webkit-tap-highlight-color: transparent;
  }

  .ap-wave-bar {
    position: absolute;
    width: 2.5px;
    border-radius: 2px;
    min-height: 3px;
    transition: background 0.15s ease, opacity 0.15s ease;
    pointer-events: none;
  }

  .ap-seek-thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-primary);
    transform: translate(-50%, -50%) scale(0);
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
    z-index: 2;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }

  .ap-seek-thumb-active {
    transform: translate(-50%, -50%) scale(1);
  }

  .ap-time-row {
    display: flex;
    justify-content: space-between;
    padding: 0 2px;
  }

  .ap-time {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .ap-time-dur {
    color: var(--text-tertiary);
  }

  .ap-right {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .ap-sm-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    min-height: 30px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 50%;
    -webkit-tap-highlight-color: transparent;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), color 150ms ease, background 150ms ease;
    font-size: 10px;
    font-weight: 700;
  }
  .ap-sm-btn:active {
    transform: scale(0.85);
    background: var(--input-bg);
  }

  .ap-speed-btn {
    font-variant-numeric: tabular-nums;
    min-width: 32px;
    border-radius: 6px;
    font-size: 10px;
  }

  .ap-speed-active {
    background: color-mix(in srgb, var(--color-primary) 18%, transparent);
    color: var(--color-primary);
    font-weight: 800;
  }
</style>