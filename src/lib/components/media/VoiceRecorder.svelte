<script lang="ts">
  import { onMount } from 'svelte';
  import { Mic, X, Send } from 'lucide-svelte';

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

  const formattedTime = $derived(() => {
    const mins = Math.floor(recordingTime / 60);
    const secs = recordingTime % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  });

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

      mediaRecorder.start(100); // collect every 100ms
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
      mediaRecorder.onstop = null; // prevent sending
      mediaRecorder.stop();
    }
    // Stop tracks via optional chaining — mediaRecorder may be null
    mediaRecorder?.stream?.getTracks().forEach((t) => t.stop());
    isRecording = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    recordingTime = 0;
    audioChunks = [];
    mediaRecorder = null;
    onCancel();
  }

  onMount(() => {
    startRecording();

    return () => {
      // Cleanup on unmount
      if (timerInterval) clearInterval(timerInterval);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      }
    };
  });
</script>

<div class="glass-header px-4 py-3 pb-safe animate-slide-up">
  <div class="flex items-center gap-3">
    <!-- Recording Indicator -->
    <div class="flex items-center gap-2">
      <span
        class="w-3 h-3 rounded-full flex-shrink-0"
        style="background: var(--color-danger); animation: pulse-dot 1s infinite ease-in-out;"
      ></span>
      <span class="text-sm font-mono font-medium" style="color: var(--text-primary);">
        {formattedTime()}
      </span>
    </div>

    <!-- Waveform Bars (CSS-only) -->
    <div class="flex-1 flex items-center justify-center gap-[2px] h-8">
      {#each Array(12) as _, i}
        <span
          class="w-[3px] rounded-full"
          style="
            background: var(--color-primary);
            height: {isRecording ? (Math.sin(Date.now() / 200 + i * 0.8) * 50 + 50) : 4}%;
            min-height: 4px;
            max-height: 100%;
            transition: height 150ms ease;
            animation: pulse-dot {0.4 + i * 0.05}s infinite ease-in-out;
          "
        ></span>
      {/each}
    </div>

    <!-- Cancel -->
    <button
      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-spring active:scale-95"
      style="color: var(--text-secondary);"
      onclick={cancelRecording}
      aria-label="Cancel recording"
    >
      <X size={22} />
    </button>

    <!-- Send -->
    <button
      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-spring active:scale-95"
      style="background: var(--color-primary); color: var(--color-primary-foreground);"
      onclick={stopRecording}
      aria-label="Send voice message"
    >
      <Send size={20} />
    </button>
  </div>
</div>