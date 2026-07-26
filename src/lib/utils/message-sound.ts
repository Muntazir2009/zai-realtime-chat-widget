// ============================================================
// message-sound.ts
// Lightweight in-app notification sound (WebAudio API, no asset file).
// Plays a pleasant two-tone blip (~150ms) when a new direct message
// arrives in a conversation the user is NOT currently viewing.
//
// Design goals:
//  - Zero dependencies, zero network (no MP3/WAV fetch).
//  - Lazy: AudioContext is created on first play (after a user gesture
//    per browser autoplay policies), and reused thereafter.
//  - Safe: every call is wrapped in try/catch — never throws, never
//    breaks the message-handling path if audio is unavailable.
//  - Subtle: short envelope-shaped sine/triangle sweep at low gain.
// ============================================================

let audioCtx: AudioContext | null = null;

/**
 * Lazily create (or reuse) a shared AudioContext. Browsers suspend
 * AudioContexts until a user gesture has occurred; we attempt to
 * resume on every call so the first message after tab-focus still
 * plays.
 */
function getAudioContext(): AudioContext | null {
  // Guard for non-browser environments (SSR, tests, etc.)
  if (typeof window === 'undefined') return null;
  const AudioCtor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioCtor();
    } catch {
      audioCtx = null;
      return null;
    }
  }

  // Some browsers (Safari, iOS) start the context in `suspended` state
  // until a user gesture. `resume()` is a no-op if already running.
  if (audioCtx.state === 'suspended') {
    // Fire-and-forget — don't block the caller on the promise.
    void audioCtx.resume().catch(() => { /* ignore */ });
  }

  return audioCtx;
}

/**
 * Play a short (~150ms) two-tone notification blip.
 * Sweep: 880Hz → 1320Hz, sine wave, gain envelope 0.0 → 0.15 → 0.0.
 *
 * Safe to call from anywhere — never throws. If audio is unavailable
 * (SSR, no AudioContext, autoplay blocked, etc.) it silently no-ops.
 */
export function playMessageSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 0.15; // 150ms total

    // Single oscillator with a quick upward frequency sweep — feels
    // like a soft "blip" rather than a harsh beep.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + duration * 0.6);

    // Gain envelope: quick attack, smooth decay. Avoids click artifacts
    // at the start/end of the buffer.
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.012);   // 12ms attack
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); // decay to end

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02); // tiny tail to avoid truncation click
  } catch {
    // Audio is best-effort — never break the calling code path.
  }
}
