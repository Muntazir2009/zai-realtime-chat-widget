// ============================================================
// Scheduled Messages Store — Svelte 5 runes class
// Manages scheduled messages persisted to localStorage.
//
// Key design decisions:
//   - Messages are NOT removed until the RTDB write succeeds.
//   - If the user is offline when a message fires, it waits for
//     the browser to come back online and then sends.
//   - On app load, overdue messages are sent immediately.
//   - Timer drift is handled by checking `sendAt` on fire.
// ============================================================

import { toastStore } from './toast.svelte.js';

const STORAGE_KEY = 'scheduled-messages';

export interface ScheduledMessage {
  id: string;
  chatId: string;
  content: string;
  sendAt: number; // epoch ms
  createdAt: number;
}

export type ScheduledStatus = 'pending' | 'sending' | 'sent' | 'failed';

function readScheduled(): ScheduledMessage[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeScheduled(msgs: ScheduledMessage[]): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  }
}

/** Check if the browser is currently online. */
function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

class ScheduledStore {
  messages: ScheduledMessage[] = $state(readScheduled());
  /** Track status of individual messages for UI feedback */
  status: Map<string, ScheduledStatus> = $state(new Map());
  private timerIds: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private onlineHandler: (() => void) | null = null;
  private _isOnline: boolean = isOnline();

  constructor() {
    this.armAll();
    this.listenOnline();
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  /** Listen for online/offline browser events */
  private listenOnline(): void {
    if (typeof window === 'undefined') return;

    this.onlineHandler = () => {
      const wasOffline = !this._isOnline;
      this._isOnline = navigator.onLine;

      if (wasOffline && this._isOnline) {
        console.log('[ScheduledStore] Back online — processing pending scheduled messages');
        this.processPending();
      }
    };

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.onlineHandler);
  }

  /** Schedule a new message */
  add(chatId: string, content: string, sendAt: Date): ScheduledMessage {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const msg: ScheduledMessage = {
      id,
      chatId,
      content,
      sendAt: sendAt.getTime(),
      createdAt: Date.now(),
    };
    this.messages = [...this.messages, msg];
    this.status = new Map(this.status).set(id, 'pending');
    writeScheduled(this.messages);
    this.armTimer(msg);
    return msg;
  }

  /** Cancel a scheduled message */
  cancel(id: string): void {
    this.disarmTimer(id);
    this.messages = this.messages.filter(m => m.id !== id);
    const s = new Map(this.status);
    s.delete(id);
    this.status = s;
    writeScheduled(this.messages);
  }

  /** Get messages for a specific chat */
  forChat(chatId: string): ScheduledMessage[] {
    return this.messages.filter(m => m.chatId === chatId);
  }

  /** Arm a timer for a single scheduled message */
  private armTimer(msg: ScheduledMessage): void {
    this.disarmTimer(msg.id);
    const delay = msg.sendAt - Date.now();
    if (delay <= 0) {
      // Already past due — will be handled by processPending
      return;
    }
    const timerId = setTimeout(() => {
      this.timerIds.delete(msg.id);
      this.tryFireMessage(msg);
    }, delay);
    this.timerIds.set(msg.id, timerId);
  }

  /** Attempt to fire a message — waits for online if needed */
  private tryFireMessage(msg: ScheduledMessage): void {
    if (!this.messages.some(m => m.id === msg.id)) return; // already sent/cancelled

    if (!this._isOnline) {
      console.log('[ScheduledStore] Message', msg.id, 'is due but offline — waiting for connectivity');
      return;
    }

    this.fireMessage(msg);
  }

  /** Fire: send the scheduled message via chatStore and remove it ONLY on success */
  private async fireMessage(msg: ScheduledMessage): Promise<void> {
    this.disarmTimer(msg.id);
    this.status = new Map(this.status).set(msg.id, 'sending');

    try {
      // Dynamic import to avoid circular dependency
      const { chatStore } = await import('./chat.svelte.js');

      // Wait for the chatStore to be ready (user authenticated, inbox loaded)
      if (!chatStore.activeChatId && !chatStore.chats.has(msg.chatId)) {
        // Chat not loaded yet — open it first so fan-out works correctly
        await chatStore.openChat(msg.chatId).catch(() => {});
      }

      await chatStore.sendMessage(msg.chatId, msg.content);

      // Success — remove from store and localStorage
      this.messages = this.messages.filter(m => m.id !== msg.id);
      const s = new Map(this.status);
      s.delete(msg.id);
      this.status = s;
      writeScheduled(this.messages);

      const timeStr = new Date(msg.sendAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      toastStore.success(`Scheduled message sent at ${timeStr}`);
    } catch (err) {
      console.error('[ScheduledStore] Failed to send scheduled message:', msg.id, err);

      // Mark as failed but keep in the list — will be retried
      this.status = new Map(this.status).set(msg.id, 'failed');
      toastStore.error('Scheduled message failed to send. It will retry when online.');

      // Retry after a delay
      const retryTimer = setTimeout(() => {
        this.timerIds.delete(msg.id);
        this.tryFireMessage(msg);
      }, 30_000); // 30 seconds
      this.timerIds.set(msg.id, retryTimer);
    }
  }

  /** Process all pending/failed messages (called on online event) */
  private processPending(): void {
    const now = Date.now();
    for (const msg of this.messages) {
      const st = this.status.get(msg.id);
      // Process messages that are due AND either pending, failed, or sending (stale)
      if (msg.sendAt <= now && (st === 'pending' || st === 'failed' || st === 'sending')) {
        this.tryFireMessage(msg);
      }
    }
  }

  /** Disarm a timer */
  private disarmTimer(id: string): void {
    const t = this.timerIds.get(id);
    if (t) { clearTimeout(t); this.timerIds.delete(id); }
  }

  /** Arm timers for all existing scheduled messages (on app load) */
  private armAll(): void {
    const now = Date.now();
    for (const msg of this.messages) {
      if (msg.sendAt > now) {
        // Still in the future — arm timer
        this.armTimer(msg);
        this.status = new Map(this.status).set(msg.id, 'pending');
      } else {
        // Past due — mark pending, will process on next online check
        this.status = new Map(this.status).set(msg.id, 'pending');
      }
    }

    // Process any overdue messages after a brief delay to let auth load
    setTimeout(() => this.processPending(), 2000);
  }

  /** Retry a specific failed message */
  retry(id: string): void {
    const msg = this.messages.find(m => m.id === id);
    if (!msg) return;
    this.status = new Map(this.status).set(id, 'pending');
    this.tryFireMessage(msg);
  }

  /** Clean up all timers (on logout) */
  disarmAll(): void {
    for (const [, t] of this.timerIds) clearTimeout(t);
    this.timerIds.clear();
    if (this.onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.onlineHandler);
      this.onlineHandler = null;
    }
  }
}

export const scheduledStore = new ScheduledStore();
