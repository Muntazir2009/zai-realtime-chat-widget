// ============================================================
// audio.ts — YouTube playback via simple iframe embed
// Uses a hidden iframe with YouTube embed URL + postMessage API.
// Fallback: if iframe API doesn't load, use embed URL autoplay.
// ============================================================

type AudioState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, opts: any) => any;
      PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
      ready: (cb: () => void) => void;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

class AudioService {
  private _state: AudioState = 'idle';
  private _currentTime = 0;
  private _duration = 0;
  private _volume = 80;
  private _timeInterval: ReturnType<typeof setInterval> | null = null;
  private _onStateChange: ((state: AudioState) => void) | null = null;
  private _onTimeUpdate: ((time: number, duration: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;
  private _currentVideoId: string | null = null;
  private _player: any = null;
  private _apiLoaded = false;
  private _apiLoading = false;
  private _apiReadyResolve: (() => void) | null = null;
  private _containerId = 'yt-music-player';
  private _containerCreated = false;
  private _useFallback = false;

  // ── Callbacks ──
  onStateChange(cb: (state: AudioState) => void): void { this._onStateChange = cb; }
  onTimeUpdate(cb: (time: number, duration: number) => void): void { this._onTimeUpdate = cb; }
  onEnded(cb: () => void): void { this._onEnded = cb; }

  get state(): AudioState { return this._state; }
  get currentTime(): number { return this._currentTime; }
  get duration(): number { return this._duration; }
  get volume(): number { return this._volume / 100; }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(100, Math.round(v * 100)));
    if (this._useFallback) {
      // Can't control volume with simple iframe embed
      return;
    }
    try { this._player?.setVolume(this._volume); } catch {}
  }

  // ── Container ──
  ensureContainer(): void {
    if (this._containerCreated) return;
    this._containerCreated = true;

    let container = document.getElementById(this._containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = this._containerId;
      container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0;z-index:-1;';
      document.body.appendChild(container);
    }
  }

  // ── YouTube IFrame API ──
  private async loadYouTubeAPI(): Promise<boolean> {
    if (this._apiLoaded) return true;
    if (this._apiLoading) {
      // Wait for existing load with timeout
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 8000);
        const origResolve = this._apiReadyResolve;
        this._apiReadyResolve = () => {
          clearTimeout(timeout);
          origResolve?.();
          resolve(true);
        };
      });
    }

    this._apiLoading = true;

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[Audio] YouTube API load timed out — using fallback');
        this._apiLoading = false;
        resolve(false);
      }, 8000);

      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout);
        this._apiLoaded = true;
        this._apiLoading = false;
        console.log('[Audio] YouTube IFrame API loaded');
        resolve(true);
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        clearTimeout(timeout);
        this._apiLoading = false;
        console.warn('[Audio] Failed to load YouTube API script — using fallback');
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  // ── Create player with YouTube API ──
  private async createAPIPlayer(): Promise<any> {
    this.ensureContainer();
    const apiReady = await this.loadYouTubeAPI();

    if (!apiReady || !window.YT) {
      this._useFallback = true;
      return null;
    }

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn('[Audio] Player creation timed out — using fallback');
        this._useFallback = true;
        resolve(null);
      }, 10000);

      try {
        this._player = new window.YT.Player(this._containerId, {
          height: '1',
          width: '1',
          videoId: this._currentVideoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              clearTimeout(timeout);
              console.log('[Audio] YT Player ready');
              try { this._player?.setVolume(this._volume); } catch {}
              resolve(this._player);
            },
            onStateChange: (event: any) => {
              this._handleStateChange(event.data);
            },
            onError: (event: any) => {
              clearTimeout(timeout);
              console.error('[Audio] YT Player error:', event.data);
              this._setState('error');
              resolve(null); // Resolve with null so flow continues
            },
          },
        });
      } catch (err) {
        clearTimeout(timeout);
        console.warn('[Audio] Player creation failed — using fallback');
        this._useFallback = true;
        resolve(null);
      }
    });
  }

  // ── Fallback: Simple iframe embed ──
  private createFallbackPlayer(videoId: string): void {
    this.ensureContainer();
    const container = document.getElementById(this._containerId);
    if (!container) return;

    // Clear any existing content
    container.innerHTML = '';

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&widgetid=1`;
    iframe.style.cssText = 'width:1px;height:1px;border:none;pointer-events:none;';
    iframe.allow = 'autoplay; encrypted-media';
    iframe.setAttribute('allowfullscreen', 'false');
    container.appendChild(iframe);

    this._player = iframe;
    console.log('[Audio] Using fallback iframe embed');

    // For fallback, we simulate playing state after a delay
    // We can't get accurate time/duration without the API
    setTimeout(() => {
      if (this._currentVideoId === videoId) {
        this._setState('playing');
        this._duration = 0; // Unknown duration in fallback mode
        this._startTimeLoop();
      }
    }, 2000);
  }

  // ── State change handler ──
  private _handleStateChange(ytState: number): void {
    const YT = window.YT?.PlayerState;
    switch (ytState) {
      case YT?.ENDED ?? 0:
        this._stopTimeLoop();
        this._onEnded?.();
        break;
      case YT?.PLAYING ?? 1:
        this._setState('playing');
        this._startTimeLoop();
        break;
      case YT?.PAUSED ?? 2:
        this._setState('paused');
        this._stopTimeLoop();
        break;
      case YT?.BUFFERING ?? 3:
        this._setState('loading');
        break;
    }
  }

  // ── Public: Play ──
  async playVideoById(videoId: string): Promise<void> {
    this._setState('loading');
    this._currentTime = 0;
    this._duration = 0;
    this._currentVideoId = videoId;

    if (this._useFallback || !window.YT) {
      // If we already know we need fallback, or API isn't available
      if (!this._apiLoaded && !this._apiLoading) {
        // Try API once first, but don't wait too long
        const apiReady = await this.loadYouTubeAPI();
        if (!apiReady) {
          this._useFallback = true;
        }
      }
    }

    if (this._useFallback) {
      this.createFallbackPlayer(videoId);
      return;
    }

    // Try to use YouTube IFrame API
    try {
      if (this._player && !this._useFallback) {
        // Reuse existing player
        this._player.loadVideoById(videoId, 0);
        console.log('[Audio] Loading video via existing player');
      } else {
        // Create new player
        const player = await this.createAPIPlayer();
        if (!player) {
          // API failed, use fallback
          this._useFallback = true;
          this.createFallbackPlayer(videoId);
        }
      }
    } catch (err) {
      console.warn('[Audio] API play failed, falling back:', err);
      this._useFallback = true;
      this.createFallbackPlayer(videoId);
    }
  }

  async playStream(url: string): Promise<void> {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (match) {
      await this.playVideoById(match[1]);
    } else {
      this._setState('error');
    }
  }

  pause(): void {
    if (this._useFallback) {
      // Can't pause fallback iframe
      this._setState('paused');
      this._stopTimeLoop();
      return;
    }
    try { this._player?.pauseVideo(); } catch {}
  }

  resume(): void {
    if (this._useFallback) {
      this._setState('playing');
      this._startTimeLoop();
      return;
    }
    try { this._player?.playVideo(); } catch {}
  }

  seek(ratio: number): void {
    if (!this._duration || this._useFallback) return;
    const t = Math.max(0, Math.min(this._duration, ratio * this._duration));
    try { this._player?.seekTo(t, true); } catch {}
    this._currentTime = t;
  }

  seekTo(seconds: number): void {
    if (this._useFallback) return;
    try { this._player?.seekTo(Math.max(0, seconds), true); } catch {}
    this._currentTime = Math.max(0, seconds);
  }

  stop(): void {
    this._stopTimeLoop();
    if (!this._useFallback) {
      try { this._player?.stopVideo(); } catch {}
    } else {
      // Remove fallback iframe
      const container = document.getElementById(this._containerId);
      if (container) container.innerHTML = '';
    }
    this._currentVideoId = null;
    this._currentTime = 0;
    this._duration = 0;
    this._setState('idle');
  }

  destroy(): void {
    this._stopTimeLoop();
    if (!this._useFallback) {
      try { this._player?.destroy(); } catch {}
    } else {
      const container = document.getElementById(this._containerId);
      if (container) container.innerHTML = '';
    }
    this._player = null;
    this._currentVideoId = null;
  }

  private _setState(s: AudioState): void {
    if (this._state === s) return;
    this._state = s;
    this._onStateChange?.(s);
  }

  private _startTimeLoop(): void {
    if (this._useFallback) {
      // In fallback mode, we can't get real time. Just tick incrementally.
      this._stopTimeLoop();
      this._timeInterval = setInterval(() => {
        if (this._duration > 0) {
          this._currentTime += 0.25;
          if (this._currentTime >= this._duration) {
            this._currentTime = this._duration;
            this._stopTimeLoop();
            this._onEnded?.();
          } else {
            this._onTimeUpdate?.(this._currentTime, this._duration);
          }
        }
      }, 250);
      return;
    }

    this._stopTimeLoop();
    this._timeInterval = setInterval(() => {
      if (this._player && !this._useFallback) {
        try {
          this._currentTime = this._player.getCurrentTime() || 0;
          this._duration = this._player.getDuration() || 0;
          this._onTimeUpdate?.(this._currentTime, this._duration);
        } catch {}
      }
    }, 250);
  }

  private _stopTimeLoop(): void {
    if (this._timeInterval !== null) {
      clearInterval(this._timeInterval);
      this._timeInterval = null;
    }
  }
}

export const audioService = new AudioService();
