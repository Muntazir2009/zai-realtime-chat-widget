<script lang="ts">
  import { Play, Pause } from 'lucide-svelte';

  interface Props {
    url: string;
    duration: number;
  }

  let { url, duration }: Props = $props();

  let isPlaying = $state(false);
  let currentTime = $state(0);
  let audioEl: HTMLAudioElement | null = $state(null);

  const formattedDuration = $derived(formatTime(duration));
  const formattedCurrent = $derived(formatTime(currentTime));
  const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function togglePlay() {
    if (!audioEl) {
      audioEl = new Audio(url);
      audioEl.addEventListener('timeupdate', () => {
        currentTime = audioEl?.currentTime || 0;
      });
      audioEl.addEventListener('ended', () => {
        isPlaying = false;
        currentTime = 0;
      });
      audioEl.addEventListener('loadedmetadata', () => {
        duration = audioEl?.duration || duration;
      });
    }

    if (isPlaying) {
      audioEl.pause();
      isPlaying = false;
    } else {
      audioEl.play();
      isPlaying = true;
    }
  }

  // Cleanup audio element on destroy
  $effect(() => {
    return () => {
      if (audioEl) {
        audioEl.pause();
        audioEl.src = '';
        audioEl = null;
      }
    };
  });

  function handleSeek(e: MouseEvent) {
    if (!audioEl) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    audioEl.currentTime = pct * duration;
    currentTime = audioEl.currentTime;
  }

  function handleKeySeek(e: KeyboardEvent) {
    if (!audioEl) return;
    if (e.key === 'ArrowRight') {
      audioEl.currentTime = Math.min(audioEl.currentTime + 5, duration);
    } else if (e.key === 'ArrowLeft') {
      audioEl.currentTime = Math.max(audioEl.currentTime - 5, 0);
    }
  }
</script>

<div class="flex items-center gap-3 min-h-[44px] w-full" style="max-width: 280px;">
  <!-- Play / Pause -->
  <button
    class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full flex-shrink-0 transition-spring active:scale-95"
    style="background: var(--color-primary); color: var(--color-primary-foreground);"
    onclick={togglePlay}
    aria-label={isPlaying ? 'Pause' : 'Play'}
  >
    {#if isPlaying}
      <Pause size={20} />
    {:else}
      <Play size={20} />
    {/if}
  </button>

  <!-- Waveform / Progress Bar -->
  <div class="flex-1 flex flex-col gap-1">
    <div
      class="h-6 flex items-center gap-[2px] cursor-pointer rounded-[var(--radius-sm)] px-1"
      onclick={handleSeek}
      onkeydown={handleKeySeek}
      role="slider"
      tabindex="0"
      aria-label="Audio progress"
      aria-valuenow={currentTime}
      aria-valuemin={0}
      aria-valuemax={duration}
    >
      {#each Array(20) as _, i}
        <span
          class="w-[3px] rounded-full flex-1"
          style="
            background: {i / 20 <= progress / 100 ? 'var(--color-primary)' : 'var(--text-tertiary)'};
            opacity: {i / 20 <= progress / 100 ? 1 : 0.3};
            height: {30 + Math.sin(i * 0.7) * 60}%;
            min-height: 4px;
          "
        ></span>
      {/each}
    </div>
    <div class="flex justify-between">
      <span class="text-xs" style="color: var(--text-tertiary);">{formattedCurrent}</span>
      <span class="text-xs" style="color: var(--text-tertiary);">{formattedDuration}</span>
    </div>
  </div>
</div>