// ============================================================
// PresenceManager — Svelte 5 runes class
// Manages online/away/offline status and typing indicators.
// Uses Firebase RTDB onDisconnect() for reliable cleanup.
// Heartbeat every 30s updates lastSeen.
//
// Presence states:
//   'online'  — tab is visible, user is actively in the app
//   'away'    — tab is hidden / minimized / in background
//   'offline' — explicitly disconnected or network down
// ============================================================

import * as rtdb from '$lib/firebase/rtdb.js';
import { isReady as firebaseIsReady } from '$lib/firebase/config.js';
import { authStore } from '$lib/stores/auth.svelte.js';
import { prefsStore } from '$lib/stores/prefs.svelte.js';
import { uiStore } from '$lib/stores/ui.svelte.js';
import type { PresenceState } from '$lib/types/index.js';
import { TYPING_DEBOUNCE_MS, RTDB_PATHS } from '$lib/types/index.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const AWAY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes of hidden = away

class PresenceManager {
  onlineStatus: 'online' | 'offline' | 'away' = $state('online');
  isTyping = $state(false);

  // Track how long the tab has been hidden
  private hiddenSince: number | null = null;
  private awayTimer: ReturnType<typeof setTimeout> | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastTypingEmit: Map<string, number> = new Map();

  private visibilityHandler: (() => void) | null = null;
  private blurHandler: (() => void) | null = null;
  private focusHandler: (() => void) | null = null;
  private pageHideHandler: (() => void) | null = null;
  private disconnectQueued = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this._setupPresenceListeners();
    }
  }

  // ── Presence listeners ──

  private _setupPresenceListeners(): void {
    // Visibility change: tab hidden → stop typing, track away timer
    this.visibilityHandler = () => {
      if (document.hidden) {
        this._onTabHidden();
      } else {
        this._onTabVisible();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Window blur/focus: supplement visibility for same-tab detection
    this.blurHandler = () => {
      // Only trigger away if not in a conversation (user left the tab)
      // When in a conversation, blur is normal (user is typing in input)
      if (uiStore.view !== 'conversation') {
        this._onTabHidden();
      }
    };
    this.focusHandler = () => {
      this._onTabVisible();
    };
    window.addEventListener('blur', this.blurHandler);
    window.addEventListener('focus', this.focusHandler);

    // Page hide: mobile Safari, tab close — fire cleanup once
    this.pageHideHandler = () => {
      this._fireCleanupBeacon();
    };
    window.addEventListener('pagehide', this.pageHideHandler);
    window.addEventListener('beforeunload', this.pageHideHandler);
  }

  private _onTabHidden(): void {
    // Stop all typing immediately — user is away
    this.stopAllTyping();

    // Track hidden duration for away status
    this.hiddenSince = Date.now();

    // Set a timer to switch to 'away' after threshold
    if (!this.awayTimer) {
      this.awayTimer = setTimeout(() => {
        if (this.hiddenSince !== null && Date.now() - this.hiddenSince >= AWAY_THRESHOLD_MS * 0.9) {
          this.goAway();
        }
        this.awayTimer = null;
      }, AWAY_THRESHOLD_MS);
    }
  }

  private _onTabVisible(): void {
    // Clear away tracking
    this.hiddenSince = null;
    if (this.awayTimer) {
      clearTimeout(this.awayTimer);
      this.awayTimer = null;
    }

    // Immediately restore online status
    const uid = this.uid;
    if (uid && this.onlineStatus !== 'online') {
      this.onlineStatus = 'online';
      this.writePresence(uid, 'online').catch(() => {});
    }
  }

  /** Fire-and-forget cleanup fetch — ensures presence is removed even if
   *  RTDB WebSocket was already torn down (e.g. by NetworkManager).
   *  Uses keepalive so the request outlives page unload. */
  private _fireCleanupBeacon(): void {
    const uid = this.uid;
    if (!uid) return;
    try {
      const body = JSON.stringify({
        path: RTDB_PATHS.PRESENCE(uid),
        value: { uid, status: 'offline', lastSeen: Date.now(), typing: false },
      });
      fetch('/api/presence/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Silently fail — onDisconnect is the real safety net
    }
  }

  private get uid(): string | undefined {
    return authStore.user?.id;
  }

  // ── Status transitions ──

  goOnline(): void {
    const uid = this.uid;
    if (!uid) return;

    this.onlineStatus = 'online';

    if (!firebaseIsReady()) {
      console.warn('[PresenceManager] Firebase not ready, will retry goOnline in 2s');
      setTimeout(() => { if (this.uid === uid && this.onlineStatus === 'online') this.goOnline(); }, 2000);
      this.writePresence(uid, 'online');
      return;
    }

    this.setupOnDisconnect(uid);

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this.updateLastSeen(uid);
      }, HEARTBEAT_INTERVAL_MS);
    }

    this.disconnectQueued = true;
  }

  private async setupOnDisconnect(uid: string): Promise<void> {
    try {
      const ref = await rtdb.ref(RTDB_PATHS.PRESENCE(uid));
      await rtdb.onDisconnectSet(ref, {
        uid,
        status: 'offline',
        lastSeen: prefsStore.lastSeenPrivacy === 'nobody' ? 0 : rtdb.serverTimestamp(),
        typing: false,
      });
      this.writePresence(uid, 'online');
    } catch (err) {
      console.warn('[PresenceManager] Failed to queue onDisconnect:', err);
      setTimeout(async () => {
        if (this.uid === uid && this.onlineStatus === 'online') {
          try {
            const ref = await rtdb.ref(RTDB_PATHS.PRESENCE(uid));
            await rtdb.onDisconnectSet(ref, {
              uid,
              status: 'offline',
              lastSeen: prefsStore.lastSeenPrivacy === 'nobody' ? 0 : rtdb.serverTimestamp(),
              typing: false,
            });
            this.writePresence(uid, 'online');
          } catch {
            this.writePresence(uid, 'online');
          }
        }
      }, 3000);
      this.writePresence(uid, 'online');
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

  // ── Typing ──

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

    const timer = setTimeout(() => this.stopTyping(chatId), TYPING_DEBOUNCE_MS + 1000);
    this.typingTimers.set(chatId, timer);
  }

  stopTyping(chatId: string): void {
    const uid = this.uid;
    if (!uid) return;

    this.isTyping = false;

    rtdb.ref(RTDB_PATHS.TYPING(chatId, uid)).then((ref) => {
      rtdb.remove(ref).catch(() => {});
    });

    this.writeTyping(chatId, uid, false);

    const timer = this.typingTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.typingTimers.delete(chatId);
    }
  }

  stopAllTyping(): void {
    const uid = this.uid;
    if (!uid) return;

    this.isTyping = false;

    for (const [chatId, timer] of this.typingTimers) {
      clearTimeout(timer);
      rtdb.ref(RTDB_PATHS.TYPING(chatId, uid)).then((ref) => {
        rtdb.remove(ref).catch(() => {});
      });
    }
    this.typingTimers.clear();
    this.lastTypingEmit.clear();
  }

  // ── Lifecycle ──

  async disconnect(): Promise<void> {
    const uid = this.uid;
    if (uid && firebaseIsReady()) {
      try {
        const ref = await rtdb.ref(RTDB_PATHS.PRESENCE(uid));
        rtdb.onDisconnectCancel(ref).catch(() => {});
        rtdb.remove(ref).catch(() => {});
      } catch (err) {
        console.warn('[PresenceManager] disconnect error:', err);
      }
    }
    this.stopHeartbeat();
    this.onlineStatus = 'offline';
    this.disconnectQueued = false;

    this.stopAllTyping();

    this._removePresenceListeners();
  }

  private _removePresenceListeners(): void {
    if (this.visibilityHandler && typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.blurHandler && typeof window !== 'undefined') {
      window.removeEventListener('blur', this.blurHandler);
      this.blurHandler = null;
    }
    if (this.focusHandler && typeof window !== 'undefined') {
      window.removeEventListener('focus', this.focusHandler);
      this.focusHandler = null;
    }
    if (this.pageHideHandler && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.pageHideHandler);
      window.removeEventListener('beforeunload', this.pageHideHandler);
      this.pageHideHandler = null;
    }
    // Clear away timer
    if (this.awayTimer) {
      clearTimeout(this.awayTimer);
      this.awayTimer = null;
    }
    this.hiddenSince = null;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── RTDB writes ──

  private async writePresence(uid: string, status: PresenceState['status']): Promise<void> {
    rtdb.set(await rtdb.ref(RTDB_PATHS.PRESENCE(uid)), {
      uid,
      status,
      lastSeen: prefsStore.lastSeenPrivacy === 'nobody' ? 0 : rtdb.serverTimestamp(),
      typing: false,
    }).catch((err) => {
      console.warn('[PresenceManager] Failed to write presence:', err);
    });
  }

  private async updateLastSeen(uid: string): Promise<void> {
    rtdb.set(await rtdb.ref(RTDB_PATHS.PRESENCE(uid)), {
      uid,
      status: this.onlineStatus,
      lastSeen: prefsStore.lastSeenPrivacy === 'nobody' ? 0 : rtdb.serverTimestamp(),
      typing: false,
    }).catch(() => {});
  }

  private async writeTyping(chatId: string, uid: string, typing: boolean): Promise<void> {
    try {
      const ref = await rtdb.ref(RTDB_PATHS.TYPING(chatId, uid));
      if (typing) {
        const ts = Date.now();
        await rtdb.set(ref, ts);
      } else {
        await rtdb.remove(ref).catch(() => {});
      }
    } catch (err) {
      console.warn('[PresenceManager] writeTyping failed:', err);
    }
  }
}

export const presenceManager = new PresenceManager();
