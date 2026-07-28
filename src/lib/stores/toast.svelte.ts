/**
 * Toast Notification Store (Svelte 5 Runes)
 *
 * Minimal bar-style toasts:
 *  - Slim, compact bar (no glassmorphism, no icons)
 *  - Auto-dismiss with subtle progress bar
 *  - Single visible toast (new ones replace old)
 *  - Fast enter/exit animations
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  createdAt: number;
  progress: number; // 0–1, managed internally
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 2500,
  error: 3500,
  info: 2500,
  warning: 3000,
};

const EXIT_ANIMATION_MS = 240;

class ToastStore {
  toasts: Toast[] = $state([]);
  exiting: string[] = $state([]);

  private _nextId = 0;
  private _rafId: number | null = null;
  private _pausedStart: Map<string, number> = new Map();
  private _totalPaused: Map<string, number> = new Map();

  show(
    message: string,
    type: ToastType = 'info',
    duration: number = DEFAULT_DURATIONS[type],
  ): void {
    if (typeof requestAnimationFrame === 'undefined' || !message.trim()) return;

    // Truncate long messages for Dynamic Island pill style
    const truncated = message.length > 50 ? message.slice(0, 47) + '…' : message;

    // If a toast with the same message is already visible, reset it
    const existing = this.toasts.find(
      (t) => t.message === truncated && t.type === type,
    );
    if (existing && !this.exiting.includes(existing.id)) {
      existing.createdAt = Date.now();
      existing.duration = duration;
      existing.progress = 1;
      this._totalPaused.set(existing.id, 0);
      this._pausedStart.delete(existing.id);
      this._startLoop();
      return;
    }

    const id = `t${++this._nextId}`;
    const toast: Toast = {
      id,
      message: truncated,
      type,
      duration,
      createdAt: Date.now(),
      progress: 1,
    };

    // Replace existing toast — only one visible at a time
    if (this.toasts.length > 0) {
      const old = this.toasts[0];
      this._dismissInternal(old.id);
    }
    this.toasts = [toast];
    this._startLoop();
  }

  success(message: string, duration?: number): void {
    this.show(message, 'success', duration ?? DEFAULT_DURATIONS.success);
  }

  error(message: string, duration?: number): void {
    this.show(message, 'error', duration ?? DEFAULT_DURATIONS.error);
  }

  info(message: string, duration?: number): void {
    this.show(message, 'info', duration ?? DEFAULT_DURATIONS.info);
  }

  warning(message: string, duration?: number): void {
    this.show(message, 'warning', duration ?? DEFAULT_DURATIONS.warning);
  }

  dismiss(id: string): void {
    if (!this.toasts.find((t) => t.id === id)) return;
    if (this.exiting.includes(id)) return;
    this.exiting = [...this.exiting, id];
    setTimeout(() => {
      this._dismissInternal(id);
      this.exiting = this.exiting.filter((eid) => eid !== id);
    }, EXIT_ANIMATION_MS);
  }

  dismissAll(): void {
    this._stopLoop();
    this.toasts = [];
    this.exiting = [];
  }

  // ── Private ────────────────────────────────────────────────

  private _dismissInternal(id: string): void {
    this._pausedStart.delete(id);
    this._totalPaused.delete(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

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

  private _tick = (): void => {
    const now = Date.now();
    let hasActive = false;

    for (const toast of this.toasts) {
      if (toast.duration <= 0) {
        toast.progress = 1;
        continue;
      }
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
        this.dismiss(toast.id);
      }
    }

    if (hasActive) {
      this._rafId = requestAnimationFrame(this._tick);
    } else {
      this._rafId = null;
    }
  };
}

export const toastStore = new ToastStore();
