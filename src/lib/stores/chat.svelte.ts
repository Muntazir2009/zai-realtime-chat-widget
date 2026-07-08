// ============================================================
// Chat Store — Svelte 5 runes class
// Core state for inbox, active conversation, messages, presence.
// All data flows through Firebase RTDB listeners.
// PRD §IV.1: max 2 active listeners at any time.
// ============================================================

import * as rtdb from '$lib/firebase/rtdb.js';
import type {
  Message, ChatMeta, UserChat, User, PresenceState,
} from '$lib/types/index.js';
import { MAX_MESSAGES_IN_MEMORY, RTDB_PATHS } from '$lib/types/index.js';
import { authStore } from './auth.svelte.js';
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
  private presenceUnsubs: Map<string, () => void> = new Map();
  private typingUnsubs: Map<string, () => void> = new Map();

  // ---- Idempotency tracking ----
  private sentKeys = new Set<string>();

  // ---- Search ----
  searchQuery = $state('');

  /** Derive filtered+sorted inbox */
  filteredInbox = $derived.by(() => {
    let entries = Array.from(this.userChats.entries());
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      entries = entries.filter(([, uc]) => {
        const meta = this.chats.get(uc.chatId);
        if (!meta) return false;
        const other = this.getOtherParticipant(meta);
        return other?.displayName.toLowerCase().includes(q) ||
               other?.username.toLowerCase().includes(q) ||
               (meta.lm ?? '').toLowerCase().includes(q);
      });
    }
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
  loadInbox(uid: string): void {
    this.detachInboxListener();

    const r = rtdb.ref(RTDB_PATHS.USER_CHATS(uid));

    // Load existing children
    this.inboxUnsub = rtdb.onChildAdded(r, (snap) => {
      const data = snap.val() as UserChat | null;
      if (!data) return;
      this.userChats.set(data.chatId, data);
      if (!this.chats.has(data.chatId)) {
        this.fetchChatMeta(data.chatId);
      }
    });

    // Listen for changes
    this.inboxChangedUnsub = rtdb.onChildChanged(r, (snap) => {
      const data = snap.val() as UserChat | null;
      if (!data) return;
      this.userChats.set(data.chatId, data);
    });
  }

  private async fetchChatMeta(chatId: string): Promise<void> {
    const snap = await rtdb.get(rtdb.ref(RTDB_PATHS.CHAT_META(chatId)));
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
    const snap = await rtdb.get(rtdb.ref(`user_index/${uid}`));
    if (!snap.exists()) {
      // Fallback: scan users node
      const allSnap = await rtdb.get(rtdb.ref('users'));
      if (allSnap.exists()) {
        allSnap.forEach((childSnap) => {
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
    const userSnap = await rtdb.get(rtdb.ref(`users/${username}`));
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
    const msgRef = rtdb.query(
      rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)),
      rtdb.limitToLast(MAX_MESSAGES_IN_MEMORY),
    );

    this.messageUnsub = rtdb.onChildAdded(msgRef, (snap) => {
      const msg = snap.val() as Message;
      if (!msg) return;
      if (this.messages.some((m) => m.id === msg.id)) return;

      this.messages = [...this.messages, msg].sort((a, b) => a.ts - b.ts);
      if (this.messages.length > MAX_MESSAGES_IN_MEMORY) {
        this.messages = this.messages.slice(-MAX_MESSAGES_IN_MEMORY);
      }
    });

    this.markAsRead(chatId);
    this.attachPresenceListeners(chatId);
    this.attachTypingListener(chatId);
  }

  async closeChat(): Promise<void> {
    if (this.messageUnsub) {
      this.messageUnsub();
      this.messageUnsub = null;
    }
    this.detachPresenceListeners();
    this.detachTypingListener();

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

  async sendMessage(chatId: string, content: string, replyToId?: string): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (this.sentKeys.has(idempotencyKey)) return;
    this.sentKeys.add(idempotencyKey);

    const msgRef = rtdb.push(rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const message: Message = {
      id: messageId,
      c: content,
      sid: user.id,
      t: 'text',
      ts: Date.now(),
      rk: idempotencyKey,
      rid: replyToId ?? null,
      mu: null,
      mh: null,
      md: null,
    };

    const meta = this.chats.get(chatId);
    const otherUid = meta?.participantIds.find((id) => id !== user.id);

    // PRD §IV.1: Single atomic multi-path update
    const updates: Record<string, unknown> = {};

    // 1. Write message
    updates[RTDB_PATHS.CHAT_MESSAGES(chatId) + '/' + messageId] = message;

    // 2. Update chat meta
    updates[RTDB_PATHS.CHAT_META(chatId)] = {
      id: chatId,
      type: 'direct',
      participantIds: meta?.participantIds ?? [user.id],
      lm: content.slice(0, 100),
      ts: message.ts,
      updatedAt: message.ts,
    };

    // 3. Update sender's lastRead
    updates[RTDB_PATHS.USER_CHAT_ENTRY(user.id, chatId)] = {
      chatId,
      uid: user.id,
      lrid: messageId,
      uc: 0,
      jt: Date.now(),
    };

    // 4. Increment recipient's unread
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

    await rtdb.update(rtdb.ref('/'), updates);

    // Optimistic render
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
  }

  /** Send an image message */
  async sendImageMessage(chatId: string, imageUrl: string, caption?: string): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (this.sentKeys.has(idempotencyKey)) return;
    this.sentKeys.add(idempotencyKey);

    const msgRef = rtdb.push(rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const message: Message = {
      id: messageId,
      c: caption ?? '📷 Photo',
      sid: user.id,
      t: 'image',
      ts: Date.now(),
      rk: idempotencyKey,
      rid: null,
      mu: imageUrl,
      mh: null,
      md: null,
    };

    const meta = this.chats.get(chatId);
    const otherUid = meta?.participantIds.find((id) => id !== user.id);

    const updates: Record<string, unknown> = {};
    updates[RTDB_PATHS.CHAT_MESSAGES(chatId) + '/' + messageId] = message;
    updates[RTDB_PATHS.CHAT_META(chatId)] = {
      id: chatId,
      type: 'direct',
      participantIds: meta?.participantIds ?? [user.id],
      lm: '📷 Photo',
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

    await rtdb.update(rtdb.ref('/'), updates);
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
  }

  /** Send a voice message */
  async sendVoiceMessage(chatId: string, voiceUrl: string, duration: number): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (this.sentKeys.has(idempotencyKey)) return;
    this.sentKeys.add(idempotencyKey);

    const msgRef = rtdb.push(rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const message: Message = {
      id: messageId,
      c: `🎙 Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`,
      sid: user.id,
      t: 'voice',
      ts: Date.now(),
      rk: idempotencyKey,
      rid: null,
      mu: voiceUrl,
      mh: null,
      md: { duration },
    };

    const meta = this.chats.get(chatId);
    const otherUid = meta?.participantIds.find((id) => id !== user.id);

    const updates: Record<string, unknown> = {};
    updates[RTDB_PATHS.CHAT_MESSAGES(chatId) + '/' + messageId] = message;
    updates[RTDB_PATHS.CHAT_META(chatId)] = {
      id: chatId,
      type: 'direct',
      participantIds: meta?.participantIds ?? [user.id],
      lm: '🎙 Voice message',
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

    await rtdb.update(rtdb.ref('/'), updates);
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

    await rtdb.update(rtdb.ref('/'), {
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

  private attachPresenceListeners(chatId: string): void {
    const meta = this.chats.get(chatId);
    if (!meta) return;
    for (const uid of meta.participantIds) {
      if (this.presenceUnsubs.has(uid)) continue;
      const r = rtdb.ref(RTDB_PATHS.PRESENCE(uid));
      const unsub = rtdb.onValue(r, (snap) => {
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

  private attachTypingListener(chatId: string): void {
    this.detachTypingListener();
    const meta = this.chats.get(chatId);
    if (!meta) return;
    for (const uid of meta.participantIds) {
      const r = rtdb.ref(RTDB_PATHS.TYPING(chatId, uid));
      const unsub = rtdb.onValue(r, (snap) => {
        if (!snap.exists()) return;
        const isTyping = snap.val() as boolean;
        const set = this.typingUsers.get(chatId) ?? new Set();
        if (isTyping) set.add(uid);
        else set.delete(uid);
        this.typingUsers.set(chatId, set);
      });
      this.typingUnsubs.set(uid, unsub);
    }
  }

  private detachTypingListener(): void {
    for (const [, unsub] of this.typingUnsubs) unsub();
    this.typingUnsubs.clear();
  }

  // ============================================================
  // Network lifecycle (PRD §III)
  // ============================================================

  detachHighFrequencyListeners(): void {
    this.detachTypingListener();
  }

  reattachListeners(): void {
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

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    await rtdb.remove(rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId) + '/' + messageId));
    this.messages = this.messages.filter((m) => m.id !== messageId);
  }
}

/** Singleton instance */
export const chatStore = new ChatStore();

networkManager.onDormant(() => chatStore.detachHighFrequencyListeners());
networkManager.onActive(() => chatStore.reattachListeners());