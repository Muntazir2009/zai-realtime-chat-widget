import type { Snippet } from 'svelte';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  icon?: Snippet;
}

class ToastStore {
  toasts: Toast[] = $state([]);
  private _nextId = 0;

  // All toast methods are no-ops — toasts are disabled
  show(_message: string, _type: ToastType = 'info', _duration = 0): void {}
  success(_message: string, _duration = 0) {}
  error(_message: string, _duration = 0) {}
  info(_message: string, _duration = 0) {}
  warning(_message: string, _duration = 0) {}

  dismiss(_id: string): void {}
  dismissAll(): void { this.toasts = []; }
}

export const toastStore = new ToastStore();