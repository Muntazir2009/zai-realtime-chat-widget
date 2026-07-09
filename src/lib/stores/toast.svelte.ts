import type { Snippet } from 'svelte';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // ms, default 3000
  icon?: Snippet;
}

class ToastStore {
  toasts: Toast[] = $state([]);
  private _nextId = 0;

  show(message: string, type: ToastType = 'info', duration = 3000): void {
    const id = `toast_${++this._nextId}`;
    const toast: Toast = { id, message, type, duration };
    this.toasts = [...this.toasts, toast];

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(message: string, duration = 3000) { this.show(message, 'success', duration); }
  error(message: string, duration = 4000) { this.show(message, 'error', duration); }
  info(message: string, duration = 3000) { this.show(message, 'info', duration); }
  warning(message: string, duration = 3500) { this.show(message, 'warning', duration); }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  dismissAll(): void {
    this.toasts = [];
  }
}

export const toastStore = new ToastStore();