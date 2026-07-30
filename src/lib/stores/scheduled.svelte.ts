// ============================================================
// Scheduled Messages Store — Svelte 5 runes class
// Manages scheduled messages persisted to localStorage.
// ============================================================

const STORAGE_KEY = 'scheduled-messages';

export interface ScheduledMessage {
  id: string;
  chatId: string;
  content: string;
  sendAt: number; // epoch ms
  createdAt: number;
}

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

class ScheduledStore {
  messages: ScheduledMessage[] = $state(readScheduled());
  private timerIds: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor() {
    this.armAll();
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
    writeScheduled(this.messages);
    this.armTimer(msg);
    return msg;
  }

  /** Cancel a scheduled message */
  cancel(id: string): void {
    this.disarmTimer(id);
    this.messages = this.messages.filter(m => m.id !== id);
    writeScheduled(this.messages);
  }

  /** Get messages for a specific chat */
  forChat(chatId: string): ScheduledMessage[] {
    return this.messages.filter(m => m.chatId === chatId);
  }

  /** Arm a timer for a single scheduled message */
  private armTimer(msg: ScheduledMessage): void {
    const delay = msg.sendAt - Date.now();
    if (delay <= 0) {
      this.fireMessage(msg);
      return;
    }
    const timerId = setTimeout(() => this.fireMessage(msg), delay);
    this.timerIds.set(msg.id, timerId);
  }

  /** Fire: send the scheduled message via chatStore and remove it */
  private fireMessage(msg: ScheduledMessage): void {
    this.disarmTimer(msg.id);
    this.messages = this.messages.filter(m => m.id !== msg.id);
    writeScheduled(this.messages);
    // Dynamic import to avoid circular dependency
    import('./chat.svelte.js').then(({ chatStore }) => {
      if (chatStore.activeChatId === msg.chatId) {
        chatStore.sendMessage(msg.chatId, msg.content);
      } else {
        chatStore.sendMessage(msg.chatId, msg.content);
      }
    }).catch(() => {});
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
        this.armTimer(msg);
      } else {
        // Fire immediately if past due
        this.fireMessage(msg);
      }
    }
  }

  /** Clean up all timers (on logout) */
  disarmAll(): void {
    for (const [, t] of this.timerIds) clearTimeout(t);
    this.timerIds.clear();
  }
}

export const scheduledStore = new ScheduledStore();
