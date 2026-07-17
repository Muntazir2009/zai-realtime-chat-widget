/**
 * Toast Notification Store (Svelte 5 Runes)
 *
 * Features:
 *  - Progress tracking (0–1) via requestAnimationFrame
 *  - Deduplication within a 2 s window
 *  - Optional icon, action button, pause-on-hover
 *  - Maximum 4 visible toasts; extras are queued
 *  - Animated exit before removal
 */

// ── Public types ──────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ShowOptions {
  icon?: string;
  action?: ToastAction;
  pauseOnHover?: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  icon?: string;
  action?: ToastAction;
  pauseOnHover?: boolean;
  createdAt: number;
  progress: number; // 0–1, managed internally
}

// ── Constants ─────────────────────────────────────────────────

const BUILT_IN_ICONS: Record<ToastType, string> = {
  success: 'check',
  error: 'x',
  warning: 'triangle',
  info: 'info',
};

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 4000,
  info: 3000,
  warning: 3000,
};

const MAX_VISIBLE = 4;
const DEDUP_WINDOW = 2000;
const EXIT_ANIMATION_MS = 280;

// ── Store ─────────────────────────────────────────────────────

class ToastStore {
  /** Active (visible) toasts. */
  toasts: Toast[] = $state([]);

  /** IDs of toasts currently playing their exit animation. */
  exiting: string[] = $state([]);

  // -- private state (non-reactive) --

  private _nextId = 0;
  private _lastShown: Map<string, number> = new Map();
  private _pausedStart: Map<string, number> = new Map();
  private _totalPaused: Map<string, number> = new Map();
  private _queue: Toast[] = [];
  private _rafId: number | null = null;

  // ── Public API ──────────────────────────────────────────────

  show(
    message: string,
    type: ToastType = 'info',
    duration: number = DEFAULT_DURATIONS[type],
    options?: ShowOptions,
  ): void {
    if (typeof requestAnimationFrame === 'undefined') return;

    // -- deduplication --
    const dedupKey = `${type}:${message}`;
    const now = Date.now();
    this._pruneLastShown(now);

    const lastShown = this._lastShown.get(dedupKey);
    if (lastShown !== undefined && now - lastShown < DEDUP_WINDOW) {
      const existing = this.toasts.find(
        (t) => t.message === message && t.type === type,
      );
      if (existing && !this.exiting.includes(existing.id)) {
        // Reset the existing toast's timer instead of duplicating
        existing.createdAt = now;
        existing.duration = duration;
        existing.progress = 1;
        this._totalPaused.set(existing.id, 0);
        this._pausedStart.delete(existing.id);
        this._lastShown.set(dedupKey, now);
        // Copy over new options if provided
        if (options) {
          if (options.icon !== undefined) existing.icon = options.icon;
          if (options.action !== undefined) existing.action = options.action;
          if (options.pauseOnHover !== undefined) existing.pauseOnHover = options.pauseOnHover;
        }
        this._startLoop();
        return;
      }
    }
    this._lastShown.set(dedupKey, now);

    // -- create toast --
    const id = `toast-${++this._nextId}`;
    const toast: Toast = {
      id,
      message,
      type,
      duration,
      icon: options?.icon ?? BUILT_IN_ICONS[type],
      action: options?.action,
      pauseOnHover: options?.pauseOnHover ?? true,
      createdAt: now,
      progress: 1,
    };

    // -- add or queue --
    if (this.toasts.length < MAX_VISIBLE) {
      this.toasts = [...this.toasts, toast];
      if (duration > 0) this._startLoop();
    } else {
      this._queue.push(toast);
    }
  }

  success(message: string, duration?: number, options?: ShowOptions): void {
    this.show(message, 'success', duration ?? DEFAULT_DURATIONS.success, options);
  }

  error(message: string, duration?: number, options?: ShowOptions): void {
    this.show(message, 'error', duration ?? DEFAULT_DURATIONS.error, options);
  }

  info(message: string, duration?: number, options?: ShowOptions): void {
    this.show(message, 'info', duration ?? DEFAULT_DURATIONS.info, options);
  }

  warning(message: string, duration?: number, options?: ShowOptions): void {
    this.show(message, 'warning', duration ?? DEFAULT_DURATIONS.warning, options);
  }

  /**
   * Dismiss a toast with exit animation.
   * Safe to call even if the toast doesn't exist.
   */
  dismiss(id: string): void {
    const exists = this.toasts.find((t) => t.id === id);
    if (!exists) return;
    this._markExiting(id);
  }

  /** Immediately remove every toast (no animation). */
  dismissAll(): void {
    this._stopLoop();
    for (const t of this.toasts) this._cleanup(t.id);
    this.toasts = [];
    this.exiting = [];
    this._queue = [];
  }

  /**
   * Pause the auto-dismiss timer for a toast (e.g. on hover).
   * Idempotent — calling pause while already paused is a no-op.
   */
  pause(id: string): void {
    if (this._pausedStart.has(id)) return;
    this._pausedStart.set(id, Date.now());
    // Keep the loop alive while paused
    this._startLoop();
  }

  /** Resume a paused toast's timer. */
  resume(id: string): void {
    const start = this._pausedStart.get(id);
    if (start === undefined) return;
    const pausedFor = Date.now() - start;
    const prev = this._totalPaused.get(id) ?? 0;
    this._totalPaused.set(id, prev + pausedFor);
    this._pausedStart.delete(id);
  }

  // ── Private helpers ─────────────────────────────────────────

  /** Mark a toast as exiting, then remove it after the animation. */
  private _markExiting(id: string): void {
    if (this.exiting.includes(id)) return;
    this.exiting = [...this.exiting, id];
    setTimeout(() => {
      this._dismissInternal(id);
      this.exiting = this.exiting.filter((eid) => eid !== id);
    }, EXIT_ANIMATION_MS);
  }

  /** Remove a toast immediately and process the queue. */
  private _dismissInternal(id: string): void {
    this._cleanup(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this._processQueue();
  }

  private _cleanup(id: string): void {
    this._pausedStart.delete(id);
    this._totalPaused.delete(id);
  }

  /** Move queued toasts into the visible list when slots are available. */
  private _processQueue(): void {
    while (this._queue.length > 0 && this.toasts.length < MAX_VISIBLE) {
      const next = this._queue.shift()!;
      this.toasts = [...this.toasts, next];
      if (next.duration > 0) this._startLoop();
    }
  }

  // ── rAF loop ────────────────────────────────────────────────

  private _startLoop(): void {
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(this._tick);
  }

  private _stopLoop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Called every frame — updates progress and triggers exit when expired. */
  private _tick = (): void => {
    const now = Date.now();
    let hasActive = false;

    for (const toast of this.toasts) {
      // Persistent toasts (duration <= 0) keep progress at 1
      if (toast.duration <= 0) {
        toast.progress = 1;
        continue;
      }

      // Paused toasts — keep their current progress
      if (this._pausedStart.has(toast.id)) {
        hasActive = true;
        continue;
      }

      const totalPaused = this._totalPaused.get(toast.id) ?? 0;
      const elapsed = now - toast.createdAt - totalPaused;
      const p = Math.max(0, 1 - elapsed / toast.duration);
      toast.progress = p;

      if (p > 0) {
        hasActive = true;
      } else {
        // Toast expired — trigger exit animation
        this._markExiting(toast.id);
      }
    }

    if (hasActive || this._queue.length > 0) {
      this._rafId = requestAnimationFrame(this._tick);
    } else {
      this._rafId = null;
    }
  };

  /** Remove stale dedup entries older than 10 s. */
  private _pruneLastShown(now: number): void {
    for (const [key, ts] of this._lastShown) {
      if (now - ts > 10_000) this._lastShown.delete(key);
    }
  }
}

export const toastStore = new ToastStore();