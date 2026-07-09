// ============================================================
// PresenceManager — Svelte 5 runes class
// Manages online/away/offline status and typing indicators.
// Writes directly to Firebase RTDB.
// Heartbeat every 30s updates lastSeen.
// ============================================================

import * as rtdb from '$lib/firebase/rtdb.js';
import { authStore } from '$lib/stores/auth.svelte.js';
import type { PresenceState } from '$lib/types/index.js';
import { TYPING_DEBOUNCE_MS, RTDB_PATHS } from '$lib/types/index.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

class PresenceManager {
  onlineStatus: 'online' | 'offline' | 'away' = $state('online');
  isTyping = $state(false);

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastTypingEmit: Map<string, number> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.disconnect());
    }
  }

  private get uid(): string | undefined {
    return authStore.user?.id;
  }

  goOnline(): void {
    const uid = this.uid;
    if (!uid) return;

    this.onlineStatus = 'online';
    this.writePresence(uid, 'online');

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this.updateLastSeen(uid);
      }, HEARTBEAT_INTERVAL_MS);
    }
  }

  goAway(): void {
    const uid = this.uid;
    if (!uid) return;
    this.onlineStatus = 'away';
    this.writePresence(uid, 'away');
  }

  goOffline(): void {
    const uid = this.uid;
    if (!uid) return;
    this.onlineStatus = 'offline';
    this.writePresence(uid, 'offline');
    this.stopHeartbeat();
  }

  setTyping(chatId: string): void {
    const uid = this.uid;
    if (!uid) return;

    this.isTyping = true;
    const now = Date.now();
    const lastEmit = this.lastTypingEmit.get(chatId) ?? 0;

    if (now - lastEmit >= TYPING_DEBOUNCE_MS) {
      this.writeTyping(chatId, uid, true);
      this.lastTypingEmit.set(chatId, now);
    }

    const existingTimer = this.typingTimers.get(chatId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => this.stopTyping(chatId), TYPING_DEBOUNCE_MS + 500);
    this.typingTimers.set(chatId, timer);
  }

  stopTyping(chatId: string): void {
    const uid = this.uid;
    if (!uid) return;

    this.isTyping = false;
    this.writeTyping(chatId, uid, false);

    const timer = this.typingTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.typingTimers.delete(chatId);
    }
  }

  async disconnect(): Promise<void> {
    const uid = this.uid;
    if (uid) {
      rtdb.remove(await rtdb.ref(RTDB_PATHS.PRESENCE(uid))).catch(() => {});
    }
    this.stopHeartbeat();
    this.onlineStatus = 'offline';

    for (const [, timer] of this.typingTimers) clearTimeout(timer);
    this.typingTimers.clear();
    this.lastTypingEmit.clear();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async writePresence(uid: string, status: PresenceState['status']): Promise<void> {
    rtdb.set(await rtdb.ref(RTDB_PATHS.PRESENCE(uid)), {
      uid,
      status,
      lastSeen: Date.now(),
      typing: false,
    }).catch((err) => {
      console.warn('[PresenceManager] Failed to write presence:', err);
    });
  }

  private async updateLastSeen(uid: string): Promise<void> {
    rtdb.set(await rtdb.ref(RTDB_PATHS.PRESENCE(uid)), {
      uid,
      status: this.onlineStatus,
      lastSeen: Date.now(),
      typing: false,
    }).catch(() => {});
  }

  private async writeTyping(chatId: string, uid: string, typing: boolean): Promise<void> {
    rtdb.set(await rtdb.ref(RTDB_PATHS.TYPING(chatId, uid)), { typing, ts: Date.now() })
      .catch(() => {});

    if (!typing) {
      setTimeout(async () => {
        rtdb.remove(await rtdb.ref(RTDB_PATHS.TYPING(chatId, uid))).catch(() => {});
      }, 3000);
    }
  }
}

export const presenceManager = new PresenceManager();