// ============================================================
// Chat Store — Svelte 5 runes class
// Core state for inbox, active conversation, messages, presence.
// All data flows through Firebase RTDB listeners.
// PRD §IV.1: max 2 active listeners at any time.
// ============================================================

import * as rtdb from '$lib/firebase/rtdb.js';
import type {
  Message, ChatMeta, UserChat, User, PresenceState, PinnedMessage,
} from '$lib/types/index.js';
import { MAX_MESSAGES_IN_MEMORY, RTDB_PATHS } from '$lib/types/index.js';
import { authStore } from './auth.svelte.js';
import { toastStore } from './toast.svelte.js';
import { networkManager } from '$lib/managers/NetworkManager.svelte.js';
import { cacheMessages, getCachedMessages, cacheUserProfiles, getUserProfile } from '$lib/managers/CacheManager.js';
import { generateIdempotencyKey } from '$lib/utils/idempotency.js';

class ChatStore {
  // ---- Inbox ----
  chats: Map<string, ChatMeta> = $state(new Map());
  userChats: Map<string, UserChat> = $state(new Map());

  // ---- Active conversation ----
  activeChatId: string | null = $state(null);
  messages: Message[] = $state([]);
  participants: User[] = $state([]);

  // ---- Presence & typing ----
  presence: Map<string, PresenceState> = $state(new Map());
  typingUsers: Map<string, Set<string>> = $state(new Map());

  // ---- User dictionary (PRD §IV.1: strip redundant user data from messages) ----
  userDict: Map<string, User> = $state(new Map());

  // ---- Listener unsubscribes ----
  private inboxUnsub: (() => void) | null = null;
  private inboxChangedUnsub: (() => void) | null = null;
  private messageUnsub: (() => void) | null = null;
  private messageChangedUnsub: (() => void) | null = null;
  private messageRemovedUnsub: (() => void) | null = null;
  private presenceUnsubs: Map<string, () => void> = new Map();
  private typingUnsubs: Map<string, () => void> = new Map();
  private typingSafetyTimeouts: Map<string, Map<string, ReturnType<typeof setTimeout>>> = new Map();

  // ---- Pinned messages ----
  pinnedMessages: Map<string, Message> = $state(new Map());
  private pinnedUnsub: (() => void) | null = null;
  private pinnedRemovedUnsub: (() => void) | null = null;

  // ---- Starred messages ----
  starredMessageIds: Set<string> = $state(new Set());
  private starredUnsub: (() => void) | null = null;

  // ---- Idempotency tracking (bounded to prevent memory leak) ----
  private sentKeys = new Set<string>();
  private static readonly MAX_SENT_KEYS = 500;

  private addSentKey(key: string): boolean {
    if (this.sentKeys.has(key)) return false;
    this.sentKeys.add(key);
    if (this.sentKeys.size > ChatStore.MAX_SENT_KEYS) {
      const iter = this.sentKeys.values();
      for (let i = 0; i < ChatStore.MAX_SENT_KEYS / 2; i++) {
        const val = iter.next().value;
        if (val !== undefined) this.sentKeys.delete(val);
      }
    }
    return true;
  }

  /** Derive sorted inbox (most recent first) */
  sortedInbox = $derived.by(() => {
    const entries = Array.from(this.userChats.entries());
    entries.sort((a, b) => {
      const metaA = this.chats.get(a[1].chatId);
      const metaB = this.chats.get(b[1].chatId);
      return (metaB?.ts ?? 0) - (metaA?.ts ?? 0);
    });
    return entries.map(([chatId, uc]) => ({
      chatId,
      userChat: uc,
      meta: this.chats.get(chatId),
    }));
  });

  // ============================================================
  // Inbox
  // ============================================================

  /** Attach RTDB listener to /user_chats/{uid} */
  async loadInbox(uid: string): Promise<void> {
    this.detachInboxListener();

    const r = await rtdb.ref(RTDB_PATHS.USER_CHATS(uid));

    // Load existing children
    this.inboxUnsub = await rtdb.onChildAdded(r, (snap) => {
      const data = snap.val() as UserChat | null;
      if (!data) return;
      this.userChats.set(data.chatId, data);
      if (!this.chats.has(data.chatId)) {
        this.fetchChatMeta(data.chatId);
      }
    });

    // Listen for changes
    this.inboxChangedUnsub = await rtdb.onChildChanged(r, (snap) => {
      const data = snap.val() as UserChat | null;
      if (!data) return;
      this.userChats.set(data.chatId, data);
    });
  }

  private async fetchChatMeta(chatId: string): Promise<void> {
    const snap = await rtdb.get(await rtdb.ref(RTDB_PATHS.CHAT_META(chatId)));
    if (snap.exists()) {
      const meta = snap.val() as ChatMeta;
      this.chats.set(chatId, meta);
      for (const pid of meta.participantIds) {
        if (!this.userDict.has(pid)) {
          this.fetchUser(pid);
        }
      }
    }
  }

  private async fetchUser(uid: string): Promise<void> {
    const cached = await getUserProfile(uid);
    if (cached) {
      this.userDict.set(uid, cached);
      return;
    }

    // Try looking up by user ID or username
    const snap = await rtdb.get(await rtdb.ref(`user_index/${uid}`));
    if (!snap.exists()) {
      // Fallback: scan users node
      const allSnap = await rtdb.get(await rtdb.ref('users'));
      if (allSnap.exists()) {
        allSnap.forEach((childSnap: any) => {
          const u = childSnap.val() as User;
          if (u.id === uid) {
            this.userDict.set(uid, u);
            cacheUserProfiles([u]);
          }
        });
      }
      return;
    }

    const username = snap.val() as string;
    const userSnap = await rtdb.get(await rtdb.ref(`users/${username}`));
    if (userSnap.exists()) {
      const user = userSnap.val() as User;
      this.userDict.set(uid, user);
      cacheUserProfiles([user]);
    }
  }

  // ============================================================
  // Active conversation
  // ============================================================

  async openChat(chatId: string): Promise<void> {
    await this.closeChat();
    this.activeChatId = chatId;

    const meta = this.chats.get(chatId);
    if (!meta) await this.fetchChatMeta(chatId);

    const currentMeta = this.chats.get(chatId);
    if (currentMeta) {
      this.participants = [];
      for (const pid of currentMeta.participantIds) {
        if (!this.userDict.has(pid)) await this.fetchUser(pid);
        const u = this.userDict.get(pid);
        if (u) this.participants.push(u);
      }
    }

    // Load from cache first
    const cached = await getCachedMessages(chatId);
    if (cached.length > 0) {
      this.messages = cached;
    }

    // Attach RTDB listener — PRD §IV.2: limitToLast(50)
    const msgRef = await rtdb.query(
      await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)),
      await rtdb.limitToLast(MAX_MESSAGES_IN_MEMORY),
    );

    this.messageUnsub = await rtdb.onChildAdded(msgRef, (snap) => {
      const raw = snap.val() as Message;
      if (!raw) return;
      const msg: Message = { ...raw, edited: raw.edited ?? false };
      if (this.messages.some((m) => m.id === msg.id)) return;

      this.messages = [...this.messages, msg].sort((a, b) => a.ts - b.ts);
      if (this.messages.length > MAX_MESSAGES_IN_MEMORY) {
        this.messages = this.messages.slice(-MAX_MESSAGES_IN_MEMORY);
      }
    });

    // Listen for message changes (edits, pin state sync)
    this.messageChangedUnsub = await rtdb.onChildChanged(msgRef, (snap) => {
      const raw = snap.val() as Message;
      if (!raw) return;
      const msg: Message = { ...raw, edited: raw.edited ?? false };
      const idx = this.messages.findIndex((m) => m.id === msg.id);
      if (idx !== -1) {
        this.messages = this.messages.map((m) => (m.id === msg.id ? msg : m));
      }
    });

    // Listen for message deletions (realtime removal)
    this.messageRemovedUnsub = await rtdb.onChildRemoved(msgRef, (snap) => {
      const msgId = snap.key;
      if (msgId) {
        this.messages = this.messages.filter(m => m.id !== msgId);
      }
    });

    this.markAsRead(chatId);
    this.attachPresenceListeners(chatId);
    this.attachTypingListener(chatId);
    this.attachPinnedListener(chatId);
    const user = authStore.user;
    if (user) this.attachStarredListener(user.id, chatId);
  }

  async closeChat(): Promise<void> {
    if (this.messageUnsub) {
      this.messageUnsub();
      this.messageUnsub = null;
    }
    if (this.messageChangedUnsub) {
      this.messageChangedUnsub();
      this.messageChangedUnsub = null;
    }
    if (this.messageRemovedUnsub) {
      this.messageRemovedUnsub();
      this.messageRemovedUnsub = null;
    }
    this.detachPresenceListeners();
    this.detachTypingListener();
    this.detachPinnedListener();
    this.detachStarredListener();

    if (this.activeChatId && this.messages.length > 0) {
      cacheMessages(this.activeChatId, this.messages);
    }

    this.activeChatId = null;
    this.messages = [];
    this.participants = [];
  }

  // ============================================================
  // Send message — PRD §IV.1 fan-out write
  // ============================================================

  /** Shared fan-out write: message + meta + user_chats in one atomic update */
  private buildFanOutUpdates(
    chatId: string,
    messageId: string,
    message: Message,
    lastMessageSnippet: string,
  ): Record<string, unknown> {
    const user = authStore.user!;
    const meta = this.chats.get(chatId);
    const otherUid = meta?.participantIds.find((id) => id !== user.id);

    const updates: Record<string, unknown> = {};
    updates[RTDB_PATHS.CHAT_MESSAGES(chatId) + '/' + messageId] = message;
    updates[RTDB_PATHS.CHAT_META(chatId)] = {
      id: chatId,
      type: 'direct',
      participantIds: meta?.participantIds ?? [user.id],
      lm: lastMessageSnippet,
      ts: message.ts,
      updatedAt: message.ts,
    };
    updates[RTDB_PATHS.USER_CHAT_ENTRY(user.id, chatId)] = {
      chatId,
      uid: user.id,
      lrid: messageId,
      uc: 0,
      jt: Date.now(),
    };
    if (otherUid) {
      const otherUC = this.userChats.get(chatId);
      updates[RTDB_PATHS.USER_CHAT_ENTRY(otherUid, chatId)] = {
        chatId,
        uid: otherUid,
        lrid: otherUC?.lrid ?? null,
        uc: (otherUC?.uc ?? 0) + 1,
        jt: otherUC?.jt ?? Date.now(),
      };
    }
    return updates;
  }

  async sendMessage(chatId: string, content: string, replyToId?: string): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (!this.addSentKey(idempotencyKey)) return;

    const msgRef = await rtdb.push(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const message: Message = {
      id: messageId, c: content, sid: user.id, t: 'text', ts: Date.now(),
      rk: idempotencyKey, rid: replyToId ?? null, mu: null, mh: null, md: null, edited: false,
    };

    const updates = this.buildFanOutUpdates(chatId, messageId, message, content.slice(0, 100));
    await rtdb.update(await rtdb.ref('/'), updates);
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
  }

  /** Send an image message */
  async sendImageMessage(chatId: string, imageUrl: string, caption?: string): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (!this.addSentKey(idempotencyKey)) return;

    const msgRef = await rtdb.push(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const message: Message = {
      id: messageId, c: caption ?? '📷 Photo', sid: user.id, t: 'image', ts: Date.now(),
      rk: idempotencyKey, rid: null, mu: imageUrl, mh: null, md: null, edited: false,
    };

    const updates = this.buildFanOutUpdates(chatId, messageId, message, '📷 Photo');
    await rtdb.update(await rtdb.ref('/'), updates);
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
  }

  /** Send a voice message */
  async sendVoiceMessage(chatId: string, voiceUrl: string, duration: number): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (!this.addSentKey(idempotencyKey)) return;

    const msgRef = await rtdb.push(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const message: Message = {
      id: messageId,
      c: `🎙 Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`,
      sid: user.id, t: 'voice', ts: Date.now(),
      rk: idempotencyKey, rid: null, mu: voiceUrl, mh: null, md: { duration }, edited: false,
    };

    const updates = this.buildFanOutUpdates(chatId, messageId, message, '🎙 Voice message');
    await rtdb.update(await rtdb.ref('/'), updates);
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
  }

  // ============================================================
  // Create direct chat
  // ============================================================

  async createDirectChat(otherUserId: string): Promise<string> {
    const user = authStore.user;
    if (!user) throw new Error('Not authenticated');

    for (const [, meta] of this.chats) {
      if (meta.type === 'direct' &&
          meta.participantIds.includes(user.id) &&
          meta.participantIds.includes(otherUserId)) {
        return meta.id;
      }
    }

    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, otherUserId }),
    });

    if (!res.ok) throw new Error('Failed to create chat');
    const data = await res.json() as { chatId: string };
    const chatId = data.chatId;

    // Set local state immediately
    const now = Date.now();
    const meta: ChatMeta = {
      id: chatId,
      type: 'direct',
      participantIds: [user.id, otherUserId],
      lm: null,
      ts: now,
      updatedAt: now,
    };
    this.chats.set(chatId, meta);
    this.userChats.set(chatId, { chatId, uid: user.id, lrid: null, uc: 0, jt: now });

    return chatId;
  }

  // ============================================================
  // Mark as read
  // ============================================================

  async markAsRead(chatId: string): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const lastMsg = this.messages[this.messages.length - 1];
    if (!lastMsg) return;

    await rtdb.update(await rtdb.ref('/'), {
      [RTDB_PATHS.USER_CHAT_ENTRY(user.id, chatId)]: {
        chatId,
        uid: user.id,
        lrid: lastMsg.id,
        uc: 0,
        jt: Date.now(),
      },
    });
  }

  // ============================================================
  // Presence listeners
  // ============================================================

  private async attachPresenceListeners(chatId: string): Promise<void> {
    const meta = this.chats.get(chatId);
    if (!meta) return;
    for (const uid of meta.participantIds) {
      if (this.presenceUnsubs.has(uid)) continue;
      const r = await rtdb.ref(RTDB_PATHS.PRESENCE(uid));
      const unsub = await rtdb.onValue(r, (snap) => {
        if (snap.exists()) {
          this.presence.set(uid, snap.val() as PresenceState);
        }
      });
      this.presenceUnsubs.set(uid, unsub);
    }
  }

  private detachPresenceListeners(): void {
    for (const [, unsub] of this.presenceUnsubs) unsub();
    this.presenceUnsubs.clear();
  }

  // ============================================================
  // Typing
  // ============================================================

  private async attachTypingListener(chatId: string): Promise<void> {
    this.detachTypingListener();
    const meta = this.chats.get(chatId);
    if (!meta) return;
    this.typingSafetyTimeouts.set(chatId, new Map());
    for (const uid of meta.participantIds) {
      const r = await rtdb.ref(RTDB_PATHS.TYPING(chatId, uid));
      const unsub = await rtdb.onValue(r, (snap) => {
        if (!snap.exists()) {
          // Node removed — clear typing state
          const set = this.typingUsers.get(chatId) ?? new Set();
          set.delete(uid);
          this.typingUsers.set(chatId, set);
          this.clearTypingSafetyTimeout(chatId, uid);
          return;
        }

        const data = snap.val() as { typing: boolean; ts: number } | null;
        if (!data || !data.typing) {
          // Not typing — remove from set
          const set = this.typingUsers.get(chatId) ?? new Set();
          set.delete(uid);
          this.typingUsers.set(chatId, set);
          this.clearTypingSafetyTimeout(chatId, uid);
          return;
        }

        // User is typing — add to set
        const set = this.typingUsers.get(chatId) ?? new Set();
        set.add(uid);
        this.typingUsers.set(chatId, set);

        // Set a 3-second safety timeout to auto-remove (in case RTDB removal is delayed/lost)
        this.clearTypingSafetyTimeout(chatId, uid);
        const timeout = setTimeout(() => {
          const s = this.typingUsers.get(chatId);
          if (s) {
            s.delete(uid);
            this.typingUsers.set(chatId, s);
          }
          const timeouts = this.typingSafetyTimeouts.get(chatId);
          if (timeouts) timeouts.delete(uid);
        }, 3000);
        this.typingSafetyTimeouts.get(chatId)!.set(uid, timeout);
      });
      this.typingUnsubs.set(uid, unsub);
    }
  }

  private clearTypingSafetyTimeout(chatId: string, uid: string): void {
    const chatTimeouts = this.typingSafetyTimeouts.get(chatId);
    if (!chatTimeouts) return;
    const t = chatTimeouts.get(uid);
    if (t) {
      clearTimeout(t);
      chatTimeouts.delete(uid);
    }
  }

  private detachTypingListener(): void {
    for (const [, unsub] of this.typingUnsubs) unsub();
    this.typingUnsubs.clear();
    // Clear all safety timeouts
    for (const [, chatTimeouts] of this.typingSafetyTimeouts) {
      for (const [, t] of chatTimeouts) clearTimeout(t);
    }
    this.typingSafetyTimeouts.clear();
  }

  // ============================================================
  // Network lifecycle (PRD §III)
  // ============================================================

  detachHighFrequencyListeners(): void {
    this.detachTypingListener();
  }

  async reattachListeners(): Promise<void> {
    if (this.activeChatId) {
      this.attachTypingListener(this.activeChatId);
    }
  }

  // ============================================================
  // Cleanup
  // ============================================================

  detachInboxListener(): void {
    if (this.inboxUnsub) {
      this.inboxUnsub();
      this.inboxUnsub = null;
    }
    if (this.inboxChangedUnsub) {
      this.inboxChangedUnsub();
      this.inboxChangedUnsub = null;
    }
  }

  detachAllListeners(): void {
    this.detachInboxListener();
    this.closeChat();
  }

  // ============================================================
  // Helpers
  // ============================================================

  getOtherParticipant(meta: ChatMeta | undefined): User | undefined {
    if (!meta) return undefined;
    const myId = authStore.user?.id;
    const otherId = meta.participantIds.find((id) => id !== myId) ?? meta.participantIds[0];
    return this.userDict.get(otherId);
  }

  getUnreadCount(chatId: string): number {
    return this.userChats.get(chatId)?.uc ?? 0;
  }

  getTypingUsersForChat(chatId: string): string[] {
    const set = this.typingUsers.get(chatId);
    if (!set || set.size === 0) return [];
    return Array.from(set).map((uid) => this.userDict.get(uid)?.displayName ?? uid);
  }

  // ============================================================
  // Pinned messages
  // ============================================================

  async attachPinnedListener(chatId: string): Promise<void> {
    this.detachPinnedListener();
    const r = await rtdb.ref(RTDB_PATHS.PINNED(chatId));

    this.pinnedUnsub = await rtdb.onChildAdded(r, (snap) => {
      const data = snap.val() as PinnedMessage | null;
      if (!data?.message) return;
      const msg: Message = { ...data.message, edited: data.message.edited ?? false };
      const newMap = new Map(this.pinnedMessages);
      newMap.set(data.messageId, msg);
      // Enforce max 3 — remove oldest if over limit
      if (newMap.size > 3) {
        const sorted = Array.from(newMap.entries()).sort((a, b) => (a[1].ts ?? 0) - (b[1].ts ?? 0));
        for (let i = 0; i < sorted.length - 3; i++) {
          newMap.delete(sorted[i][0]);
        }
      }
      this.pinnedMessages = newMap;
    });

    this.pinnedRemovedUnsub = await rtdb.onChildRemoved(r, (snap) => {
      const data = snap.val() as PinnedMessage | null;
      if (!data) return;
      const newMap = new Map(this.pinnedMessages);
      newMap.delete(data.messageId);
      this.pinnedMessages = newMap;
    });
  }

  detachPinnedListener(): void {
    if (this.pinnedUnsub) {
      this.pinnedUnsub();
      this.pinnedUnsub = null;
    }
    if (this.pinnedRemovedUnsub) {
      this.pinnedRemovedUnsub();
      this.pinnedRemovedUnsub = null;
    }
    this.pinnedMessages = new Map();
  }

  async togglePin(chatId: string, msg: Message): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    try {
      if (this.pinnedMessages.has(msg.id)) {
        // Unpin
        await rtdb.remove(await rtdb.ref(RTDB_PATHS.PINNED(chatId) + '/' + msg.id));
        toastStore.success('Message unpinned');
      } else if (this.pinnedMessages.size < 3) {
        // Pin
        const pinned: PinnedMessage = {
          messageId: msg.id,
          pinnedBy: user.id,
          pinnedAt: Date.now(),
          message: msg,
        };
        await rtdb.set(await rtdb.ref(RTDB_PATHS.PINNED(chatId) + '/' + msg.id), pinned);
        toastStore.success('Message pinned');
      } else {
        toastStore.warning('Maximum 3 pinned messages');
      }
    } catch (err) {
      console.error('[togglePin]', err);
      toastStore.error('Failed to update pin');
    }
  }

  // ============================================================
  // Starred messages
  // ============================================================

  async attachStarredListener(uid: string, chatId: string): Promise<void> {
    this.detachStarredListener();
    const r = await rtdb.ref(RTDB_PATHS.STARRED(uid, chatId));

    this.starredUnsub = await rtdb.onChildAdded(r, (snap) => {
      const data = snap.val() as { messageId: string } | null;
      if (!data?.messageId) return;
      const newSet = new Set(this.starredMessageIds);
      newSet.add(data.messageId);
      this.starredMessageIds = newSet;
    });
  }

  detachStarredListener(): void {
    if (this.starredUnsub) {
      this.starredUnsub();
      this.starredUnsub = null;
    }
    this.starredMessageIds = new Set();
  }

  async toggleStar(chatId: string, msg: Message): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const starRef = await rtdb.ref(RTDB_PATHS.STARRED(user.id, chatId) + '/' + msg.id);

    try {
      if (this.starredMessageIds.has(msg.id)) {
        // Unstar
        await rtdb.remove(starRef);
        const newSet = new Set(this.starredMessageIds);
        newSet.delete(msg.id);
        this.starredMessageIds = newSet;
        toastStore.success('Message unstarred');
      } else {
        // Star
        await rtdb.set(starRef, {
          messageId: msg.id,
          starredAt: Date.now(),
          message: { id: msg.id, c: msg.c, t: msg.t, ts: msg.ts, sid: msg.sid },
        });
        const newSet = new Set(this.starredMessageIds);
        newSet.add(msg.id);
        this.starredMessageIds = newSet;
        toastStore.success('Message starred');
      }
    } catch (err) {
      console.error('[toggleStar]', err);
      toastStore.error('Failed to update star');
    }
  }

  // ============================================================
  // Edit message
  // ============================================================

  async editMessage(chatId: string, messageId: string, newContent: string): Promise<void> {
    try {
      await rtdb.update(await rtdb.ref('/'), {
        [`chats/${chatId}/messages/${messageId}/c`]: newContent,
        [`chats/${chatId}/messages/${messageId}/edited`]: true,
      });
      // Update local messages array
      this.messages = this.messages.map((m) =>
        m.id === messageId ? { ...m, c: newContent, edited: true } : m,
      );
      toastStore.success('Message edited');
    } catch (err) {
      console.error('[editMessage]', err);
      toastStore.error('Failed to edit message');
    }
  }

  // ============================================================
  // Delete message
  // ============================================================

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    await rtdb.remove(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId) + '/' + messageId));
    this.messages = this.messages.filter((m) => m.id !== messageId);
  }
}

/** Singleton instance */
export const chatStore = new ChatStore();

networkManager.onDormant(() => chatStore.detachHighFrequencyListeners());
networkManager.onActive(() => chatStore.reattachListeners());