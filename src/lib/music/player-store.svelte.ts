// ============================================================
// player-store.svelte.ts — Reactive music player state (Svelte 5)
// Singleton. Initialized lazily on first access.
// ============================================================

import { audioService } from './audio.js';
import { getAudioStreamUrl, type YTSearchResult, searchMusic, resolveTrack } from './youtube.js';

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  url: string;
}

type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

class PlayerStore {
  // ── Reactive state (Svelte 5 runes) ──
  status: PlayerStatus = $state('idle');
  currentTrack: Track | null = $state(null);
  queue: Track[] = $state([]);
  queueIndex = $state(-1);
  currentTime = $state(0);
  duration = $state(0);
  volume = $state(0.8);
  isExpanded = $state(false);
  isSearchOpen = $state(false);
  isQueueOpen = $state(false);
  searchResults: YTSearchResult[] = $state([]);
  isSearching = $state(false);
  searchQuery = $state('');
  errorMessage = $state('');

  private _initialized = false;
  private _streamResolve: ((url: string) => void) | null = null;

  /** Initialize audio callbacks (idempotent) */
  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    audioService.onStateChange((state) => {
      switch (state) {
        case 'idle': this.status = 'idle'; break;
        case 'loading': this.status = 'loading'; break;
        case 'playing': this.status = 'playing'; this.errorMessage = ''; break;
        case 'paused': this.status = 'paused'; break;
        case 'error': this.status = 'error'; break;
      }
    });

    audioService.onTimeUpdate((time, dur) => {
      this.currentTime = time;
      this.duration = dur;
    });

    audioService.onEnded(() => {
      this.playNext();
    });
  }

  // ── Playback controls ──

  async playTrack(track: Track): Promise<void> {
    this.init();
    this.currentTrack = track;
    this.status = 'loading';
    this.errorMessage = '';

    // If track is in queue, update queue index
    const idx = this.queue.findIndex(t => t.id === track.id);
    if (idx !== -1) this.queueIndex = idx;

    try {
      const url = await getAudioStreamUrl(track.id);
      await audioService.playStream(url);
    } catch (err) {
      this.status = 'error';
      this.errorMessage = err instanceof Error ? err.message : 'Playback failed';
      console.error('[Player] playTrack failed:', err);
    }
  }

  pause(): void {
    this.init();
    audioService.pause();
  }

  resume(): void {
    this.init();
    audioService.resume();
  }

  togglePlayPause(): void {
    if (this.status === 'playing') this.pause();
    else if (this.status === 'paused' || (this.status === 'loading' && this.currentTrack)) this.resume();
  }

  async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      audioService.stop();
      this.status = 'idle';
      this.currentTrack = null;
      this.queueIndex = -1;
      return;
    }
    const nextIdx = this.queueIndex >= 0 ? (this.queueIndex + 1) % this.queue.length : 0;
    this.queueIndex = nextIdx;
    await this.playTrack(this.queue[nextIdx]!);
  }

  async playPrevious(): Promise<void> {
    if (this.queue.length === 0) return;
    // If more than 3 seconds in, restart current track
    if (this.currentTime > 3) {
      audioService.seekTo(0);
      return;
    }
    const prevIdx = this.queueIndex > 0 ? this.queueIndex - 1 : this.queue.length - 1;
    this.queueIndex = prevIdx;
    await this.playTrack(this.queue[prevIdx]!);
  }

  seek(ratio: number): void {
    audioService.seek(ratio);
  }

  setVolume(v: number): void {
    this.volume = v;
    audioService.setVolume(v);
  }

  // ── Queue management ──

  addToQueue(track: Track): void {
    this.queue = [...this.queue, track];
    // Auto-play if nothing is playing
    if (this.status === 'idle' || !this.currentTrack) {
      this.queueIndex = this.queue.length - 1;
      this.playTrack(track);
    }
  }

  removeFromQueue(index: number): void {
    const newQueue = [...this.queue];
    newQueue.splice(index, 1);

    // Adjust index
    if (index < this.queueIndex) {
      this.queueIndex = this.queueIndex - 1;
    } else if (index === this.queueIndex) {
      // Currently playing track removed — stop
      audioService.stop();
      this.status = 'idle';
      this.currentTrack = null;
      if (newQueue.length > 0) {
        this.queueIndex = Math.min(this.queueIndex, newQueue.length - 1);
      } else {
        this.queueIndex = -1;
      }
    }

    this.queue = newQueue;
  }

  clearQueue(): void {
    this.queue = [];
    this.queueIndex = -1;
  }

  // ── Search ──

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      this.searchResults = [];
      return;
    }
    this.searchQuery = query;
    this.isSearching = true;
    try {
      this.searchResults = await searchMusic(query);
    } catch (err) {
      this.searchResults = [];
      console.error('[Player] Search failed:', err);
    } finally {
      this.isSearching = false;
    }
  }

  /** Play a search result (adds to queue and starts) */
  async playFromSearch(result: YTSearchResult): Promise<void> {
    const track: Track = {
      id: result.id,
      title: result.title,
      artist: result.artist,
      duration: result.duration,
      thumbnail: result.thumbnail,
      url: result.videoUrl,
    };

    // Add to queue if not already present
    if (!this.queue.find(t => t.id === track.id)) {
      this.queue = [...this.queue, track];
    }

    this.queueIndex = this.queue.findIndex(t => t.id === track.id);
    await this.playTrack(track);
  }

  /** Queue a search result without playing */
  queueFromSearch(result: YTSearchResult): void {
    const track: Track = {
      id: result.id,
      title: result.title,
      artist: result.artist,
      duration: result.duration,
      thumbnail: result.thumbnail,
      url: result.videoUrl,
    };
    this.addToQueue(track);
  }

  /** /play command */
  async commandPlay(query: string): Promise<string> {
    const track = await resolveTrack(query);
    if (!track) return `Could not find "${query}"`;
    this.addToQueue(track);
    return null; // null = success
  }

  /** /queue command */
  async commandQueue(query: string): Promise<string> {
    const track = await resolveTrack(query);
    if (!track) return `Could not find "${query}"`;
    this.addToQueue(track);
    return `Queued: ${track.title}`;
  }

  /** /nowplaying info */
  nowPlayingInfo(): string | null {
    if (!this.currentTrack) return null;
    return `🎵 ${this.currentTrack.title} — ${this.currentTrack.artist}`;
  }

  // ── UI state ──

  expand(): void { this.isExpanded = true; }
  collapse(): void { this.isExpanded = false; this.isSearchOpen = false; this.isQueueOpen = false; }
  toggleExpand(): void {
    if (this.isExpanded) this.collapse();
    else this.expand();
  }
  toggleSearch(): void { this.isSearchOpen = !this.isSearchOpen; this.isQueueOpen = false; }
  toggleQueue(): void { this.isQueueOpen = !this.isQueueOpen; this.isSearchOpen = false; }
}

/** Singleton — initialized lazily when first needed */
export const playerStore = new PlayerStore();
