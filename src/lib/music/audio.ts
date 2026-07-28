// ============================================================
// audio.ts — Audio playback singleton
// Manages a single HTMLAudioElement for music playback.
// ============================================================

type AudioState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

class AudioService {
  private el: HTMLAudioElement;
  private _state: AudioState = 'idle';
  private _currentTime = 0;
  private _duration = 0;
  private _volume = 0.8;
  private _rafId: number | null = null;
  private _onStateChange: ((state: AudioState) => void) | null = null;
  private _onTimeUpdate: ((time: number, duration: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;
  private _currentStreamUrl: string | null = null;

  constructor() {
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.volume = this._volume;

    this.el.addEventListener('play', () => this._setState('playing'));
    this.el.addEventListener('pause', () => {
      if (this._state === 'playing') this._setState('paused');
    });
    this.el.addEventListener('ended', () => {
      this._stopTimeLoop();
      this._onEnded?.();
    });
    this.el.addEventListener('error', () => {
      this._setState('error');
    });
    this.el.addEventListener('loadedmetadata', () => {
      this._duration = this.el.duration || 0;
    });
    this.el.addEventListener('durationchange', () => {
      this._duration = this.el.duration || 0;
    });
  }

  /** Set callbacks */
  onStateChange(cb: (state: AudioState) => void): void { this._onStateChange = cb; }
  onTimeUpdate(cb: (time: number, duration: number) => void): void { this._onTimeUpdate = cb; }
  onEnded(cb: () => void): void { this._onEnded = cb; }

  get state(): AudioState { return this._state; }
  get currentTime(): number { return this._currentTime; }
  get duration(): number { return this._duration; }
  get volume(): number { return this._volume; }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    this.el.volume = this._volume;
  }

  /** Load a stream URL and start playing */
  async playStream(url: string): Promise<void> {
    // If same URL, just resume
    if (this._currentStreamUrl === url && this._state === 'paused') {
      this.el.play().catch(() => {});
      return;
    }

    this._stopTimeLoop();
    this._currentStreamUrl = url;
    this._setState('loading');
    this._currentTime = 0;

    try {
      this.el.src = url;
      await this.el.play();
      this._startTimeLoop();
    } catch (err) {
      console.error('[Audio] Play failed:', err);
      this._setState('error');
    }
  }

  pause(): void {
    this.el.pause();
    this._stopTimeLoop();
  }

  resume(): void {
    this.el.play().catch(() => {});
    this._startTimeLoop();
  }

  /** Seek to a position (0-1 ratio) */
  seek(ratio: number): void {
    if (!this._duration) return;
    const t = Math.max(0, Math.min(this._duration, ratio * this._duration));
    this.el.currentTime = t;
    this._currentTime = t;
  }

  /** Seek to absolute seconds */
  seekTo(seconds: number): void {
    this.el.currentTime = Math.max(0, seconds);
    this._currentTime = Math.max(0, seconds);
  }

  stop(): void {
    this._stopTimeLoop();
    this.el.pause();
    this.el.src = '';
    this._currentStreamUrl = null;
    this._currentTime = 0;
    this._duration = 0;
    this._setState('idle');
  }

  destroy(): void {
    this._stopTimeLoop();
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }

  private _setState(s: AudioState): void {
    if (this._state === s) return;
    this._state = s;
    this._onStateChange?.(s);
  }

  private _startTimeLoop(): void {
    this._stopTimeLoop();
    const tick = () => {
      this._currentTime = this.el.currentTime || 0;
      this._duration = this.el.duration || 0;
      this._onTimeUpdate?.(this._currentTime, this._duration);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  private _stopTimeLoop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}

/** Singleton */
export const audioService = new AudioService();
