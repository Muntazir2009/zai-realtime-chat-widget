// ============================================================
// NetworkManager — Svelte 5 runes class
// PRD §III — Dormant state strategy for mobile battery savings.
//
// States:
//   active       — all listeners attached, real-time updates
//   dormant      — page hidden > 5 min, high-freq listeners detached
//   disconnected — hidden > 5 min OR OS memory pressure
// ============================================================

import type { ConnectionState } from '$lib/types/index.js';
import { DORMANT_TIMEOUT_MS } from '$lib/types/index.js';

type StateChangeCallback = (state: ConnectionState) => void;

class NetworkManager {
  connectionState: ConnectionState = $state('active');
  lastSyncTimestamp: number = $state(Date.now());

  private hiddenAt: number | null = null;
  private dormantTimer: ReturnType<typeof setTimeout> | null = null;
  private dormantCallbacks: StateChangeCallback[] = [];
  private activeCallbacks: StateChangeCallback[] = [];
  private visibilityHandler: (() => void) | null = null;

  constructor() {
    if (typeof document === 'undefined') return;

    this.visibilityHandler = () => this.onVisibilityChange();
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Listen for OS memory pressure (if supported)
    if ('memory' in navigator) {
      (navigator as Navigator & { memory?: { addEventListener?: (type: string, cb: () => void) => void } }).memory?.addEventListener?.('memorypressure', () => {
        if (this.connectionState !== 'disconnected') {
          this.transitionTo('disconnected');
        }
      });
    }
  }

  /** Register a callback fired when entering dormant state */
  onDormant(cb: StateChangeCallback): () => void {
    this.dormantCallbacks.push(cb);
    return () => {
      this.dormantCallbacks = this.dormantCallbacks.filter((fn) => fn !== cb);
    };
  }

  /** Register a callback fired when returning to active state */
  onActive(cb: StateChangeCallback): () => void {
    this.activeCallbacks.push(cb);
    return () => {
      this.activeCallbacks = this.activeCallbacks.filter((fn) => fn !== cb);
    };
  }

  /** Call this to refresh the sync timestamp (e.g. after a successful fetch) */
  markSynced(): void {
    this.lastSyncTimestamp = Date.now();
  }

  /** Cleanup */
  destroy(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.dormantTimer) {
      clearTimeout(this.dormantTimer);
      this.dormantTimer = null;
    }
    this.dormantCallbacks = [];
    this.activeCallbacks = [];
  }

  // ---- Private ----

  private onVisibilityChange(): void {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      // Schedule transition to dormant after DORMANT_TIMEOUT_MS
      this.dormantTimer = setTimeout(() => {
        if (document.hidden) {
          this.transitionTo('dormant');
          // Then after another brief period (or immediately per OS pressure),
          // transition to disconnected
          this.dormantTimer = setTimeout(() => {
            if (document.hidden) {
              this.transitionTo('disconnected');
            }
          }, 30_000);
        }
      }, DORMANT_TIMEOUT_MS);
    } else {
      // Page visible again
      if (this.dormantTimer) {
        clearTimeout(this.dormantTimer);
        this.dormantTimer = null;
      }
      this.hiddenAt = null;
      if (this.connectionState !== 'active') {
        this.transitionTo('active');
      }
    }
  }

  private transitionTo(state: ConnectionState): void {
    if (this.connectionState === state) return;
    const prev = this.connectionState;
    this.connectionState = state;

    if (state === 'dormant') {
      this.dormantCallbacks.forEach((cb) => cb(state));
    }
    if (state === 'active' && prev !== 'active') {
      this.markSynced();
      this.activeCallbacks.forEach((cb) => cb(state));
    }
  }
}

/** Singleton instance */
export const networkManager = new NetworkManager();