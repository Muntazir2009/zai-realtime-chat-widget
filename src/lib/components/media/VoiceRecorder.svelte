<script lang="ts">
  import { onMount } from 'svelte';
  import { Send } from 'lucide-svelte';

  interface Props {
    onSend: (blob: Blob, duration: number) => void;
    onCancel: () => void;
  }

  let { onSend, onCancel }: Props = $props();

  let isRecording = $state(false);
  let recordingTime = $state(0);
  let mediaRecorder: MediaRecorder | null = $state(null);
  let audioChunks: Blob[] = $state([]);
  let timerInterval: ReturnType<typeof setInterval> | null = $state(null);

  /* ── Slide-to-cancel state ── */
  let dragOffset = $state(0);
  let isDragging = $state(false);
  let startX = 0;
  const CANCEL_THRESHOLD = 100;

  const formattedTime = $derived(() => {
    const mins = Math.floor(recordingTime / 60);
    const secs = recordingTime % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  });

  /** 0 = idle, 1 = at cancel threshold */
  const cancelProgress = $derived(
    Math.min(Math.max(-dragOffset, 0) / CANCEL_THRESHOLD, 1)
  );

  /** Waveform dim factor while dragging toward cancel */
  const waveformDim = $derived(1 - cancelProgress * 0.7);

  /* ── Recording logic ── */
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      recordingTime = 0;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        onSend(blob, recordingTime);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      isRecording = true;

      timerInterval = setInterval(() => {
        recordingTime++;
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      onCancel();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    mediaRecorder?.stream?.getTracks().forEach((t) => t.stop());
    isRecording = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    recordingTime = 0;
    audioChunks = [];
    mediaRecorder = null;
    dragOffset = 0;
    isDragging = false;
    onCancel();
  }

  /* ── Touch gesture handlers ── */
  function handleTouchStart(e: TouchEvent) {
    if ((e.target as HTMLElement).closest('.send-btn')) return;
    isDragging = true;
    startX = e.touches[0].clientX;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startX;
    dragOffset = Math.min(dx, 0);
    if (-dragOffset >= CANCEL_THRESHOLD) {
      cancelRecording();
    }
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    dragOffset = 0;
  }

  /* ── Mouse gesture handlers (window-level for move/up) ── */
  function handleMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.send-btn')) return;
    isDragging = true;
    startX = e.clientX;
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
  }

  function handleWindowMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    dragOffset = Math.min(dx, 0);
    if (-dragOffset >= CANCEL_THRESHOLD) {
      cancelRecording();
    }
  }

  function handleWindowMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    dragOffset = 0;
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
  }

  /* ── Lifecycle ── */
  onMount(() => {
    startRecording();

    return () => {
      if (timerInterval) clearInterval(timerInterval);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      }
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="recorder-shell"
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  ontouchcancel={handleTouchEnd}
  onmousedown={handleMouseDown}
  role="region"
  tabindex="-1"
  aria-label="Voice recorder"
>
  <div
    class="recorder-inner"
    style="transform: translateX({dragOffset}px);"
  >
    <!-- Slide-to-cancel zone -->
    <div
      class="cancel-zone"
      style="opacity: {0.25 + cancelProgress * 0.75}; transform: scale({0.85 + cancelProgress * 0.15});"
    >
      <span class="cancel-chevron">⟨</span>
      <span class="cancel-text">Cancel</span>
    </div>

    <!-- Center: recording indicator + waveform -->
    <div class="center-area">
      <div class="timer-group">
        <span class="rec-dot"></span>
        <span class="timer-text">{formattedTime()}</span>
      </div>

      <!-- 20-bar CSS-animated waveform -->
      <div
        class="waveform"
        style="opacity: {waveformDim}; transform: scaleY({waveformDim});"
      >
        {#each Array(20) as _, i}
          <span
            class="wave-bar"
            style="animation-delay: {i * 0.06}s;"
          ></span>
        {/each}
      </div>
    </div>

    <!-- Send button -->
    <button
      class="send-btn"
      style="transform: scale({1 - cancelProgress * 0.5}); opacity: {1 - cancelProgress * 0.8};"
      onclick={stopRecording}
      aria-label="Send voice message"
    >
      <Send size={18} />
    </button>
  </div>
</div>

<style>
  /* ── Shell (full-width, safe area) ── */
  .recorder-shell {
    width: 100%;
    padding: 0 6px;
    padding-bottom: max(8px, env(safe-area-inset-bottom, 0px) + 4px);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: default;
  }

  /* ── Glass bar ── */
  .recorder-inner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: var(--radius-pill);
    background: var(--glass-bg);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: var(--glass-border);
    box-shadow:
      0 -0.5px 0 var(--border-subtle),
      0 2px 12px rgba(0, 0, 0, 0.04);
    will-change: transform;
    /* No transition on transform — drag must be instant */
  }

  /* ── Cancel zone ── */
  .cancel-zone {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 80px;
    padding: 6px 10px;
    border-radius: var(--radius-md);
    background: rgba(239, 68, 68, 0.08);
    color: var(--color-danger);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    transition: opacity 0.15s ease, transform 0.15s ease;
    flex-shrink: 0;
    pointer-events: none;
  }

  .cancel-chevron {
    font-size: 16px;
    font-weight: 300;
    line-height: 1;
  }

  .cancel-text {
    white-space: nowrap;
  }

  /* ── Center area ── */
  .center-area {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    overflow: hidden;
  }

  /* ── Recording indicator ── */
  .timer-group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .rec-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-danger);
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
    animation: pulseDot 1s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes pulseDot {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.4);
      opacity: 0.6;
    }
  }

  .timer-text {
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    white-space: nowrap;
  }

  /* ── Waveform ── */
  .waveform {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 32px;
    flex: 1;
    min-width: 0;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .wave-bar {
    width: 2.5px;
    min-height: 3px;
    height: 100%;
    border-radius: 2px;
    background: var(--color-primary);
    transform-origin: bottom center;
    animation: waveformPulse 1.2s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes waveformPulse {
    0%, 100% {
      transform: scaleY(0.3);
      opacity: 0.4;
    }
    50% {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  /* ── Send button ── */
  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    box-shadow: 0 2px 10px rgba(220, 38, 38, 0.35);
    cursor: pointer;
    flex-shrink: 0;
    transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .send-btn:active {
    transform: scale(0.88) !important;
    box-shadow: 0 1px 4px rgba(220, 38, 38, 0.2);
  }
</style>