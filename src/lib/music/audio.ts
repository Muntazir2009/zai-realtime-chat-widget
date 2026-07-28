// ============================================================
// audio.ts — YouTube IFrame Player API wrapper
// Uses the official YouTube IFrame Player API for playback,
// since direct audio streaming is blocked in sandboxed environments.
// ============================================================

type AudioState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

// YouTube IFrame Player API types (minimal)
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        opts: YTPlayerOptions,
      ) => YTPlayerInstance;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
      ready: (cb: () => void) => void;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerOptions {
  height?: string;
  width?: string;
  videoId?: string;
  playerVars?: {
    autoplay?: number;
    controls?: number;
    disablekb?: number;
    fs?: number;
    modestbranding?: number;
    rel?: number;
    showinfo?: number;
    origin?: string;
    enablejsapi?: number;
  };
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
    onError?: (event: { data: number; target: YTPlayerInstance }) => void;
  };
}

interface YTPlayerInstance {
  destroy(): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoLoadedFraction(): number;
  setVolume(volume: number): void;
  getVolume(): number;
  isMuted(): boolean;
}

class AudioService {
  private _state: AudioState = 'idle';
  private _currentTime = 0;
  private _duration = 0;
  private _volume = 80; // YouTube API uses 0-100
  private _rafId: number | null = null;
  private _timeInterval: ReturnType<typeof setInterval> | null = null;
  private _onStateChange: ((state: AudioState) => void) | null = null;
  private _onTimeUpdate: ((time: number, duration: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;
  private _currentVideoId: string | null = null;
  private _player: YTPlayerInstance | null = null;
  private _apiLoaded = false;
  private _apiLoading = false;
  private _readyResolve: (() => void) | null = null;
  private _readyPromise: Promise<void> | null = null;
  private _containerId: string;
  private _iframeCreated = false;

  constructor(containerId: string = 'yt-player-container') {
    this._containerId = containerId;
  }

  /** Set callbacks */
  onStateChange(cb: (state: AudioState) => void): void {
    this._onStateChange = cb;
  }
  onTimeUpdate(cb: (time: number, duration: number) => void): void {
    this._onTimeUpdate = cb;
  }
  onEnded(cb: () => void): void {
    this._onEnded = cb;
  }

  get state(): AudioState { return this._state; }
  get currentTime(): number { return this._currentTime; }
  get duration(): number { return this._duration; }
  get volume(): number { return this._volume / 100; }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(100, Math.round(v * 100)));
    this._player?.setVolume(this._volume);
  }

  /** Ensure the iframe container exists in the DOM */
  ensureContainer(): void {
    if (this._iframeCreated) return;
    this._iframeCreated = true;

    // Create container div if it doesn't exist
    let container = document.getElementById(this._containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = this._containerId;
      container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0;';
      document.body.appendChild(container);
    }
  }

  /** Load the YouTube IFrame API script */
  private async loadAPI(): Promise<void> {
    if (this._apiLoaded) return;
    if (this._apiLoading && this._readyPromise) return this._readyPromise;

    this._apiLoading = true;
    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    return new Promise<void>((resolve) => {
      // Set the global callback
      window.onYouTubeIframeAPIReady = () => {
        this._apiLoaded = true;
        this._apiLoading = false;
        this._readyResolve?.();
        resolve();
      };

      // Load the script
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    });
  }

  /** Create or get the YT.Player instance */
  private async getOrCreatePlayer(): Promise<YTPlayerInstance> {
    if (this._player) return this._player;

    this.ensureContainer();
    await this.loadAPI();

    return new Promise<YTPlayerInstance>((resolve, reject) => {
      const container = document.getElementById(this._containerId);
      if (!container) {
        reject(new Error('YouTube player container not found'));
        return;
      }

      this._player = new window.YT.Player(this._containerId, {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          enablejsapi: 1,
        },
        events: {
          onReady: (_event) => {
            console.log('[Audio] YT Player ready');
            this._player?.setVolume(this._volume);
            resolve(this._player!);
          },
          onStateChange: (event) => {
            this._handleYTStateChange(event.data);
          },
          onError: (event) => {
            console.error('[Audio] YT Player error:', event.data);
            if (this._state !== 'idle') {
              this._setState('error');
            }
          },
        },
      });
    });
  }

  /** Map YouTube player states to our AudioState */
  private _handleYTStateChange(ytState: number): void {
    switch (ytState) {
      case window.YT?.PlayerState?.ENDED ?? 0:
        this._stopTimeLoop();
        this._onEnded?.();
        break;
      case window.YT?.PlayerState?.PLAYING ?? 1:
        this._setState('playing');
        this._startTimeLoop();
        break;
      case window.YT?.PlayerState?.PAUSED ?? 2:
        this._setState('paused');
        this._stopTimeLoop();
        break;
      case window.YT?.PlayerState?.BUFFERING ?? 3:
        this._setState('loading');
        break;
      case window.YT?.PlayerState?.CUED ?? 5:
        // Video cued but not playing
        break;
    }
  }

  /** Play a YouTube video by ID */
  async playVideoById(videoId: string): Promise<void> {
    this._setState('loading');
    this._currentTime = 0;
    this._duration = 0;
    this._currentVideoId = videoId;

    try {
      const player = await this.getOrCreatePlayer();
      player.loadVideoById(videoId, 0);
      // State will update via onStateChange callback
    } catch (err) {
      console.error('[Audio] Play failed:', err);
      this._setState('error');
    }
  }

  /** Load a stream URL (for compatibility, treated as video ID if it's a YT URL) */
  async playStream(url: string): Promise<void> {
    // Check if it's a YouTube URL and extract video ID
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      await this.playVideoById(ytMatch[1]);
      return;
    }

    // Otherwise it might be a direct audio stream URL — won't work in sandbox
    console.warn('[Audio] Direct stream URLs not supported in this environment');
    this._setState('error');
  }

  pause(): void {
    this._player?.pauseVideo();
  }

  resume(): void {
    this._player?.playVideo();
  }

  seek(ratio: number): void {
    if (!this._duration) return;
    const t = Math.max(0, Math.min(this._duration, ratio * this._duration));
    this._player?.seekTo(t, true);
    this._currentTime = t;
  }

  seekTo(seconds: number): void {
    this._player?.seekTo(Math.max(0, seconds), true);
    this._currentTime = Math.max(0, seconds);
  }

  stop(): void {
    this._stopTimeLoop();
    this._player?.stopVideo();
    this._currentVideoId = null;
    this._currentTime = 0;
    this._duration = 0;
    this._setState('idle');
  }

  destroy(): void {
    this._stopTimeLoop();
    this._player?.destroy();
    this._player = null;
    this._currentVideoId = null;
  }

  private _setState(s: AudioState): void {
    if (this._state === s) return;
    const prev = this._state;
    this._state = s;
    this._onStateChange?.(s);
  }

  private _startTimeLoop(): void {
    this._stopTimeLoop();
    // YouTube API doesn't fire timeupdate events, so we poll
    this._timeInterval = setInterval(() => {
      if (this._player) {
        try {
          this._currentTime = this._player.getCurrentTime() || 0;
          this._duration = this._player.getDuration() || 0;
          this._onTimeUpdate?.(this._currentTime, this._duration);
        } catch {
          // Player might have been destroyed
        }
      }
    }, 250); // Update 4 times per second
  }

  private _stopTimeLoop(): void {
    if (this._timeInterval !== null) {
      clearInterval(this._timeInterval);
      this._timeInterval = null;
    }
  }
}

/** Singleton — uses a fixed container ID */
export const audioService = new AudioService('yt-music-player-container');
