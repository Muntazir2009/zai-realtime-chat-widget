// ============================================================
// Chat Store — Svelte 5 runes class
// Core state for inbox, active conversation, messages, presence.
// All data flows through Firebase RTDB listeners.
// PRD §IV.1: max 2 active listeners at any time.
// ============================================================

import * as rtdb from '$lib/firebase/rtdb.js';
import type {
  Message, ChatMeta, UserChat, User, PresenceState, PinnedMessage, Reaction,
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
  // Reactive tick to force UI updates for typing indicator
  private _typingTick: number = $state(0);

  // ---- Read receipts: track other user's lastReadMessageId per chat ----
  otherUserReadIds: Map<string, string> = $state(new Map()); // chatId → lrid

  // ---- User dictionary (PRD §IV.1: strip redundant user data from messages) ----
  userDict: Map<string, User> = $state(new Map());

  // ---- Listener unsubscribes ----
  private inboxUnsub: (() => void) | null = null;
  private inboxChangedUnsub: (() => void) | null = null;
  private chatMetaUnsubs: Map<string, () => void> = new Map();
  private messageUnsub: (() => void) | null = null;
  private messageChangedUnsub: (() => void) | null = null;
  private messageRemovedUnsub: (() => void) | null = null;
  private presenceUnsubs: Map<string, () => void> = new Map();
  private presenceStaleTimer: ReturnType<typeof setInterval> | null = null;
  private typingUnsubs: Map<string, () => void> = new Map();
  private typingSafetyTimeouts: Map<string, Map<string, ReturnType<typeof setTimeout>>> = new Map();
  private otherReadUnsub: (() => void) | null = null;

  // ---- Self profile listener ----
  private selfProfileUnsub: (() => void) | null = null;

  // ---- Pinned messages ----
  pinnedMessages: Map<string, Message> = $state(new Map());
  private pinnedUnsub: (() => void) | null = null;
  private pinnedRemovedUnsub: (() => void) | null = null;

  // ---- Starred messages ----
  starredMessageIds: Set<string> = $state(new Set());
  private starredUnsub: (() => void) | null = null;

  // ---- Reactions ----
  reactions: Map<string, Reaction[]> = $state(new Map()); // messageId → reactions[]
  private reactionUnsubs: Map<string, () => void> = new Map();
  private reactionChildChangedUnsubs: Map<string, () => void> = new Map();
  private reactionChildRemovedUnsubs: Map<string, () => void> = new Map();

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

  /** Derive sorted inbox (most recent first). Shows all user_chats entries, even before meta loads. */
  sortedInbox = $derived.by(() => {
    const entries = Array.from(this.userChats.entries());
    entries.sort((a, b) => {
      const metaA = this.chats.get(a[1].chatId);
      const metaB = this.chats.get(b[1].chatId);
      // If no meta, use joinedAt timestamp as fallback
      return (metaB?.ts ?? b[1].jt) - (metaA?.ts ?? a[1].jt);
    });
    return entries.map(([chatId, uc]) => ({
      chatId,
      userChat: uc,
      meta: this.chats.get(chatId) ?? null,
    }));
  });

  // ============================================================
  // Inbox
  // ============================================================

  /** Attach RTDB listener to /user_chats/{uid} and /chats/{chatId}/meta for each */
  async loadInbox(uid: string): Promise<void> {
    this.detachInboxListener();

    const r = await rtdb.ref(RTDB_PATHS.USER_CHATS(uid));

    // Load existing children
    this.inboxUnsub = await rtdb.onChildAdded(r, (snap) => {
      const data = snap.val() as UserChat | null;
      if (!data) return;
      const newMap = new Map(this.userChats);
      newMap.set(data.chatId, data);
      this.userChats = newMap;
      if (!this.chats.has(data.chatId)) {
        this.fetchChatMeta(data.chatId);
      }
      // Also attach a meta listener so the inbox re-sorts when the other user sends
      this.attachChatMetaListener(data.chatId);
    });

    // Listen for changes
    this.inboxChangedUnsub = await rtdb.onChildChanged(r, (snap) => {
      const data = snap.val() as UserChat | null;
      if (!data) return;
      const newMap = new Map(this.userChats);
      newMap.set(data.chatId, data);
      this.userChats = newMap;
    });
  }

  /** Listen for chat meta changes so inbox stays sorted when new messages arrive */
  private async attachChatMetaListener(chatId: string): Promise<void> {
    if (this.chatMetaUnsubs.has(chatId)) return;
    const metaRef = await rtdb.ref(RTDB_PATHS.CHAT_META(chatId));
    const unsub = await rtdb.onValue(metaRef, (snap) => {
      if (snap.exists()) {
        const meta = snap.val() as ChatMeta;
        const newMap = new Map(this.chats);
        newMap.set(chatId, meta);
        this.chats = newMap;
        // Fetch participant profiles if not cached
        const otherIds: string[] = [];
        for (const pid of meta.participantIds) {
          if (!this.userDict.has(pid)) {
            this.fetchUser(pid);
          }
          // Collect other users (not self) for presence listening
          if (pid !== authStore.user?.id) {
            otherIds.push(pid);
          }
        }
        // Ensure presence listeners for inbox participants (real-time online dots)
        if (otherIds.length > 0) {
          this.ensurePresenceListeners(otherIds);
        }
      }
    });
    this.chatMetaUnsubs.set(chatId, unsub);
  }

  private async fetchChatMeta(chatId: string): Promise<void> {
    const snap = await rtdb.get(await rtdb.ref(RTDB_PATHS.CHAT_META(chatId)));
    if (snap.exists()) {
      const meta = snap.val() as ChatMeta;
      const newMap = new Map(this.chats);
      newMap.set(chatId, meta);
      this.chats = newMap;
      for (const pid of meta.participantIds) {
        if (!this.userDict.has(pid)) {
          this.fetchUser(pid);
        }
      }
    }
  }

  private async fetchUser(uid: string): Promise<void> {
    // 1. Check IndexedDB cache — validate it's a real User (not corrupt proxy remnant)
    const cached = await getUserProfile(uid);
    if (cached && cached.displayName && cached.username) {
      const m = new Map(this.userDict);
      m.set(uid, cached);
      this.userDict = m;
      return;
    }

    // 2. Primary lookup: user_index/{uid} → username → users/{username}
    //    (users are stored under their username, NOT their uid)
    const indexSnap = await rtdb.get(await rtdb.ref(`user_index/${uid}`));
    if (indexSnap.exists()) {
      const username = indexSnap.val() as string;
      if (username) {
        const userSnap = await rtdb.get(await rtdb.ref(`users/${username}`));
        if (userSnap.exists()) {
          const user = userSnap.val() as User;
          if (user && user.displayName) {
            const m = new Map(this.userDict);
            m.set(uid, user);
            this.userDict = m;
            cacheUserProfiles([user]);
            return;
          }
        }
      }
    }

    // 3. Fallback: try direct users/{uid} path (for alternative schemas)
    const directSnap = await rtdb.get(await rtdb.ref(RTDB_PATHS.USER_PROFILE(uid)));
    if (directSnap.exists()) {
      const user = directSnap.val() as User;
      if (user && user.displayName) {
        const m = new Map(this.userDict);
        m.set(uid, user);
        this.userDict = m;
        cacheUserProfiles([user]);
        return;
      }
    }

    // 4. Last resort: scan the entire users node (expensive, rarely needed)
    const allSnap = await rtdb.get(await rtdb.ref('users'));
    if (allSnap.exists()) {
      let found = false;
      allSnap.forEach((childSnap: any) => {
        const u = childSnap.val() as User;
        if (u && u.id === uid && u.displayName) {
          const m = new Map(this.userDict);
          m.set(uid, u);
          this.userDict = m;
          cacheUserProfiles([u]);
          found = true;
        }
      });
      if (found) return;
    }
  }

  // ============================================================
  // Active conversation
  // ============================================================

  async openChat(chatId: string): Promise<void> {
    await this.closeChat();
    this.activeChatId = chatId;
    this.reactions = new Map();

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
      // Attach reaction listener for new messages
      if (this.activeChatId) {
        this.attachSingleReactionListener(this.activeChatId, msg.id);
      }
      // Auto-mark as read when a new message arrives (user has chat open)
      if (this.activeChatId && msg.sid !== authStore.user?.id) {
        this.markAsRead(this.activeChatId);
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
    await this.attachPresenceListeners(chatId);
    this.startPresenceStaleCheck();
    await this.attachTypingListener(chatId);
    await this.attachOtherUserReadListener(chatId);
    this.attachPinnedListener(chatId);
    this.attachReactionListeners(chatId);
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
    // Don't detach presence listeners — they stay global for the inbox online dots
    this.detachTypingListener();
    this.detachOtherUserReadListener();
    this.detachPinnedListener();
    this.detachStarredListener();
    this.detachReactionListeners();

    if (this.activeChatId && this.messages.length > 0) {
      cacheMessages(this.activeChatId, this.messages);
    }

    this.activeChatId = null;
    this.messages = [];
    this.participants = [];
  }

  /** Delete a chat: removes user_chats entry for current user (leaves the chat for them) */
  async deleteChat(chatId: string): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    // If this chat is currently open, close it first
    if (this.activeChatId === chatId) {
      await this.closeChat();
    }

    try {
      // Remove this user's entry from user_chats
      const userChatRef = await rtdb.ref(RTDB_PATHS.USER_CHAT_ENTRY(user.id, chatId));
      await rtdb.remove(userChatRef);

      // Remove from local state
      const newUserChats = new Map(this.userChats);
      newUserChats.delete(chatId);
      this.userChats = newUserChats;

      // Optionally clean up local chat meta cache
      const newChats = new Map(this.chats);
      newChats.delete(chatId);
      this.chats = newChats;

      // Clean up meta listener if it exists
      const metaUnsub = this.chatMetaUnsubs.get(chatId);
      if (metaUnsub) {
        metaUnsub();
        this.chatMetaUnsubs.delete(chatId);
      }
    } catch (err: any) {
      console.error('[deleteChat] Failed:', err);
      toastStore.error(`Failed to delete chat: ${err.message?.slice(0, 80) || 'Unknown error'}`);
    }
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
    // Use dot-notation to only update the fields that change — this preserves
    // wallpaper, uploadedWallpapers, and any other meta fields untouched.
    const metaPath = RTDB_PATHS.CHAT_META(chatId);
    updates[metaPath + '/id'] = chatId;
    updates[metaPath + '/type'] = 'direct';
    updates[metaPath + '/participantIds'] = meta?.participantIds ?? [user.id];
    updates[metaPath + '/lm'] = lastMessageSnippet;
    updates[metaPath + '/ts'] = message.ts;
    updates[metaPath + '/updatedAt'] = message.ts;
    const senderUC = this.userChats.get(chatId);
    updates[RTDB_PATHS.USER_CHAT_ENTRY(user.id, chatId)] = {
      chatId,
      uid: user.id,
      lrid: messageId,
      uc: 0,
      jt: senderUC?.jt ?? Date.now(),
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

  async sendMessage(chatId: string, content: string, replyToId?: string, metadata?: Record<string, unknown>): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (!this.addSentKey(idempotencyKey)) return;

    const msgRef = await rtdb.push(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const message: Message = {
      id: messageId, c: content, sid: user.id, t: 'text', ts: Date.now(),
      rk: idempotencyKey, rid: replyToId ?? null, mu: null, mh: null, md: metadata ?? null, edited: false,
    };

    const updates = this.buildFanOutUpdates(chatId, messageId, message, content.slice(0, 100));
    // Optimistic: add to local array immediately so UI updates instantly
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
    await rtdb.update(await rtdb.ref('/'), updates).catch((err) => {
      console.error('[sendMessage] RTDB write failed:', err);
      // Remove the optimistic message on failure
      this.messages = this.messages.filter((m) => m.id !== messageId);
    });
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
    // Optimistic: add to local array immediately
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
    await rtdb.update(await rtdb.ref('/'), updates).catch((err) => {
      console.error('[sendImageMessage] RTDB write failed:', err);
      this.messages = this.messages.filter((m) => m.id !== messageId);
    });
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
    // Optimistic: add to local array immediately
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
    await rtdb.update(await rtdb.ref('/'), updates).catch((err) => {
      console.error('[sendVoiceMessage] RTDB write failed:', err);
      this.messages = this.messages.filter((m) => m.id !== messageId);
    });
  }

  // ============================================================
  // Create direct chat
  // ============================================================

  async createDirectChat(otherUserId: string): Promise<string> {
    const user = authStore.user;
    if (!user) throw new Error('Not authenticated');

    // Check if a direct chat with this user already exists (local + server)
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

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Create chat failed (HTTP ${res.status}): ${body || res.statusText}`);
    }
    const data = await res.json() as { chatId: string };
    const chatId = data.chatId;

    // Set local state immediately so the chat appears in inbox
    const now = Date.now();
    const meta: ChatMeta = {
      id: chatId,
      type: 'direct',
      participantIds: [user.id, otherUserId],
      lm: null,
      ts: now,
      updatedAt: now,
    };
    const chatsMap = new Map(this.chats);
    chatsMap.set(chatId, meta);
    this.chats = chatsMap;
    const ucMap = new Map(this.userChats);
    ucMap.set(chatId, { chatId, uid: user.id, lrid: null, uc: 0, jt: now });
    this.userChats = ucMap;

    // Fetch the other user's profile so the chat tile can show name/avatar
    if (!this.userDict.has(otherUserId)) {
      this.fetchUser(otherUserId);
    }

    // Attach a real-time meta listener so the inbox stays in sync when
    // messages are sent and the chat meta (lm, ts) changes on the server.
    this.attachChatMetaListener(chatId).catch(() => {});

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
    const uids = meta.participantIds.filter((uid) => uid !== authStore.user?.id);
    await this.ensurePresenceListeners(uids);
    this.startPresenceStaleCheck();
  }

  /** Idempotent: attaches presence listeners for the given UIDs if not already subscribed */
  async ensurePresenceListeners(uids: string[]): Promise<void> {
    for (const uid of uids) {
      if (this.presenceUnsubs.has(uid)) continue;
      const r = await rtdb.ref(RTDB_PATHS.PRESENCE(uid));
      const unsub = await rtdb.onValue(r, (snap) => {
        if (snap.exists()) {
          const raw = snap.val() as PresenceState;
          const newMap = new Map(this.presence);
          // Client-side stale detection: if lastSeen > 90s ago, treat as offline.
          // This catches orphaned presence nodes from crashes/disconnects
          // where onDisconnect failed to fire.
          if (raw.status === 'online' && raw.lastSeen) {
            const age = Date.now() - raw.lastSeen;
            if (age > 90_000) {
              newMap.set(uid, { ...raw, status: 'offline' });
            } else {
              newMap.set(uid, raw);
            }
          } else {
            newMap.set(uid, raw);
          }
          this.presence = newMap;
        } else {
          // Presence node removed entirely — treat as offline
          const newMap = new Map(this.presence);
          newMap.delete(uid);
          this.presence = newMap;
        }
      });
      this.presenceUnsubs.set(uid, unsub);
    }
  }

  private detachPresenceListeners(): void {
    for (const [, unsub] of this.presenceUnsubs) unsub();
    this.presenceUnsubs.clear();
    this.presence = new Map();
    this.stopPresenceStaleCheck();
  }

  /** Periodically re-evaluate presence entries for staleness (>90s = offline) */
  private startPresenceStaleCheck(): void {
    this.stopPresenceStaleCheck();
    this.presenceStaleTimer = setInterval(() => {
      if (this.presence.size === 0) return;
      let changed = false;
      const newMap = new Map(this.presence);
      for (const [uid, state] of newMap) {
        if (state.status === 'online' && state.lastSeen) {
          if (Date.now() - state.lastSeen > 90_000) {
            newMap.set(uid, { ...state, status: 'offline' });
            changed = true;
          }
        }
      }
      if (changed) this.presence = newMap;
    }, 15_000);
  }

  private stopPresenceStaleCheck(): void {
    if (this.presenceStaleTimer) {
      clearInterval(this.presenceStaleTimer);
      this.presenceStaleTimer = null;
    }
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
        const newMap = new Map(this.typingUsers);
        const set = new Set(newMap.get(chatId) ?? []);
        if (!snap.exists()) {
          set.delete(uid);
          this.clearTypingSafetyTimeout(chatId, uid);
        } else {
          const data = snap.val() as { typing: boolean; ts: number } | null;
          if (!data || !data.typing) {
            set.delete(uid);
            this.clearTypingSafetyTimeout(chatId, uid);
          } else {
            set.add(uid);
            this.clearTypingSafetyTimeout(chatId, uid);
            const timeout = setTimeout(() => {
              const s = this.typingUsers.get(chatId);
              if (s) {
                const updated = new Set(s);
                updated.delete(uid);
                const m = new Map(this.typingUsers);
                m.set(chatId, updated);
                this.typingUsers = m;
                this._typingTick++;
              }
              const timeouts = this.typingSafetyTimeouts.get(chatId);
              if (timeouts) timeouts.delete(uid);
            }, 3000);
            this.typingSafetyTimeouts.get(chatId)!.set(uid, timeout);
          }
        }
        newMap.set(chatId, set);
        this.typingUsers = newMap;
        this._typingTick++; // Force reactive update for typing indicator UI
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
  // Read Receipts — listen to OTHER user's user_chats entry
  // ============================================================

  /** Listen to the other participant's user_chats/{otherUid}/{chatId} for their lrid */
  private async attachOtherUserReadListener(chatId: string): Promise<void> {
    this.detachOtherUserReadListener();
    const meta = this.chats.get(chatId);
    if (!meta || !authStore.user) return;
    const myId = authStore.user.id;
    const otherUid = meta.participantIds.find(id => id !== myId);
    if (!otherUid) return;

    try {
      const r = await rtdb.ref(RTDB_PATHS.USER_CHAT_ENTRY(otherUid, chatId));
      this.otherReadUnsub = await rtdb.onValue(r, (snap) => {
        const newMap = new Map(this.otherUserReadIds);
        if (snap.exists()) {
          const data = snap.val() as UserChat | null;
          if (data?.lrid) {
            newMap.set(chatId, data.lrid);
          } else {
            newMap.delete(chatId);
          }
        } else {
          newMap.delete(chatId);
        }
        this.otherUserReadIds = newMap;
      });
    } catch (err) {
      console.warn('[ChatStore] Failed to attach other user read listener:', err);
    }
  }

  private detachOtherUserReadListener(): void {
    if (this.otherReadUnsub) {
      this.otherReadUnsub();
      this.otherReadUnsub = null;
    }
  }

  // ============================================================
  // Network lifecycle (PRD §III)
  // ============================================================

  detachHighFrequencyListeners(): void {
    this.detachTypingListener();
  }

  async reattachListeners(): Promise<void> {
    if (this.activeChatId) {
      await this.attachTypingListener(this.activeChatId);
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
    for (const [, unsub] of this.chatMetaUnsubs) unsub();
    this.chatMetaUnsubs.clear();
  }

  // ---- Self profile listener ----

  /** Listen to own profile changes for real-time sync */
  async listenToSelfProfile(uid: string): Promise<void> {
    this.detachSelfProfileListener();
    
    // Find username from user_index
    const indexSnap = await rtdb.get(await rtdb.ref(`user_index/${uid}`));
    if (!indexSnap.exists()) return;
    const username = indexSnap.val() as string;
    
    const profileRef = await rtdb.ref(`users/${username}`);
    this.selfProfileUnsub = await rtdb.onValue(profileRef, (snap) => {
      if (snap.exists()) {
        const user = snap.val() as User;
        if (user && user.displayName) {
          const m = new Map(this.userDict);
          m.set(uid, user);
          this.userDict = m;
          cacheUserProfiles([user]);
        }
      }
    });
  }

  private detachSelfProfileListener(): void {
    if (this.selfProfileUnsub) {
      this.selfProfileUnsub();
      this.selfProfileUnsub = null;
    }
  }

  detachAllListeners(): void {
    this.detachInboxListener();
    this.closeChat();
    this.detachPresenceListeners(); // Full cleanup on logout
    this.detachSelfProfileListener();
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
      const msgId = snap.key;
      if (!msgId) return;
      const newMap = new Map(this.pinnedMessages);
      newMap.delete(msgId);
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

    const isPinned = this.pinnedMessages.has(msg.id);

    // Optimistic: update local state immediately
    if (isPinned) {
      const newMap = new Map(this.pinnedMessages);
      newMap.delete(msg.id);
      this.pinnedMessages = newMap;
    } else if (this.pinnedMessages.size < 3) {
      const newMap = new Map(this.pinnedMessages);
      newMap.set(msg.id, msg);
      this.pinnedMessages = newMap;
    } else {
      toastStore.warning('Maximum 3 pinned messages');
      return;
    }

    try {
      if (isPinned) {
        await rtdb.remove(await rtdb.ref(RTDB_PATHS.PINNED(chatId) + '/' + msg.id));
        toastStore.success('Message unpinned');
      } else {
        const pinned: PinnedMessage = {
          messageId: msg.id,
          pinnedBy: user.id,
          pinnedAt: Date.now(),
          message: msg,
        };
        await rtdb.set(await rtdb.ref(RTDB_PATHS.PINNED(chatId) + '/' + msg.id), pinned);
        toastStore.success('Message pinned');
      }
    } catch (err) {
      // Revert on failure
      if (isPinned) {
        const newMap = new Map(this.pinnedMessages);
        newMap.set(msg.id, msg);
        this.pinnedMessages = newMap;
      } else {
        const newMap = new Map(this.pinnedMessages);
        newMap.delete(msg.id);
        this.pinnedMessages = newMap;
      }
      const msg2 = err instanceof Error ? err.message : String(err);
      console.error('[togglePin]', msg2);
      toastStore.error(`Pin failed: ${msg2.slice(0, 60)}`);
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

    const isStarred = this.starredMessageIds.has(msg.id);

    // Optimistic: update local state immediately
    const newSet = new Set(this.starredMessageIds);
    if (isStarred) {
      newSet.delete(msg.id);
    } else {
      newSet.add(msg.id);
    }
    this.starredMessageIds = newSet;

    const starRef = await rtdb.ref(RTDB_PATHS.STARRED(user.id, chatId) + '/' + msg.id);

    try {
      if (isStarred) {
        await rtdb.remove(starRef);
        toastStore.success('Message unstarred');
      } else {
        await rtdb.set(starRef, {
          messageId: msg.id,
          starredAt: Date.now(),
          message: { id: msg.id, c: msg.c, t: msg.t, ts: msg.ts, sid: msg.sid },
        });
        toastStore.success('Message starred');
      }
    } catch (err) {
      // Revert on failure
      const revertSet = new Set(this.starredMessageIds);
      if (isStarred) {
        revertSet.add(msg.id);
      } else {
        revertSet.delete(msg.id);
      }
      this.starredMessageIds = revertSet;
      const msg2 = err instanceof Error ? err.message : String(err);
      console.error('[toggleStar]', msg2);
      toastStore.error(`Star failed: ${msg2.slice(0, 60)}`);
    }
  }

  // ============================================================
  // Edit message — optimistic update
  // ============================================================

  async editMessage(chatId: string, messageId: string, newContent: string): Promise<void> {
    // Optimistic: update local state immediately
    const prevMessages = this.messages;
    this.messages = this.messages.map((m) =>
      m.id === messageId ? { ...m, c: newContent, edited: true } : m,
    );
    try {
      const updates: Record<string, unknown> = {
        [`chats/${chatId}/messages/${messageId}/c`]: newContent,
        [`chats/${chatId}/messages/${messageId}/edited`]: true,
      };
      // Also update inbox preview if this was the last message
      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg?.id === messageId) {
        updates[RTDB_PATHS.CHAT_META(chatId) + '/lm'] = newContent.slice(0, 100);
      }
      await rtdb.update(await rtdb.ref('/'), updates);
      toastStore.success('Message edited');
    } catch (err) {
      // Revert on failure
      this.messages = prevMessages;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[editMessage]', msg);
      toastStore.error(`Edit failed: ${msg.slice(0, 60)}`);
    }
  }

  // ============================================================
  // Delete message — optimistic update
  // ============================================================

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    // Optimistic: remove from local array immediately
    const prevMessages = this.messages;
    this.messages = this.messages.filter((m) => m.id !== messageId);
    try {
      await rtdb.remove(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId) + '/' + messageId));
      // Update inbox preview if the deleted message was the last visible one
      const newLastMsg = this.messages[this.messages.length - 1];
      const metaUpdates: Record<string, unknown> = {};
      if (newLastMsg) {
        metaUpdates[RTDB_PATHS.CHAT_META(chatId) + '/lm'] = newLastMsg.c.slice(0, 100);
        metaUpdates[RTDB_PATHS.CHAT_META(chatId) + '/ts'] = newLastMsg.ts;
      } else {
        metaUpdates[RTDB_PATHS.CHAT_META(chatId) + '/lm'] = null;
      }
      await rtdb.update(await rtdb.ref('/'), metaUpdates).catch(() => {
        // Best-effort meta update — don't fail the delete
      });
      toastStore.success('Deleted');
    } catch (err) {
      // Revert on failure
      this.messages = prevMessages;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[deleteMessage]', msg);
      toastStore.error(`Delete failed: ${msg.slice(0, 60)}`);
    }
  }

  // ============================================================
  // Chat Wallpaper (per-chat, synced via RTDB)
  // ============================================================

  /** Set or clear the wallpaper for a chat. Both participants see it. */
  async setChatWallpaper(chatId: string, wallpaper: string | null): Promise<void> {
    try {
      const meta = this.chats.get(chatId);
      if (!meta) return;
      const metaRef = await rtdb.ref(RTDB_PATHS.CHAT_META(chatId));
      await rtdb.update(metaRef, { wallpaper } as any);
      // Optimistic local update
      const newMap = new Map(this.chats);
      newMap.set(chatId, { ...meta, wallpaper });
      this.chats = newMap;
      toastStore.success(wallpaper ? 'Wallpaper set' : 'Wallpaper removed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[setChatWallpaper]', msg);
      toastStore.error(`Failed to set wallpaper`);
    }
  }

  /** Add a wallpaper URL to the shared uploaded gallery for this chat. */
  async addChatUploadedWallpaper(chatId: string, url: string): Promise<void> {
    try {
      const meta = this.chats.get(chatId);
      if (!meta) return;
      const current = meta.uploadedWallpapers ?? [];
      // Deduplicate and cap at 20
      const updated = [url, ...current.filter(u => u !== url)].slice(0, 20);
      const metaRef = await rtdb.ref(RTDB_PATHS.CHAT_META(chatId));
      await rtdb.update(metaRef, { uploadedWallpapers: updated } as any);
      // Optimistic local update
      const newMap = new Map(this.chats);
      newMap.set(chatId, { ...meta, uploadedWallpapers: updated });
      this.chats = newMap;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[addChatUploadedWallpaper]', msg);
      toastStore.error('Failed to save wallpaper');
    }
  }

  /** Remove a wallpaper URL from the shared uploaded gallery for this chat. */
  async removeChatUploadedWallpaper(chatId: string, url: string): Promise<void> {
    try {
      const meta = this.chats.get(chatId);
      if (!meta) return;
      const current = meta.uploadedWallpapers ?? [];
      const updated = current.filter(u => u !== url);
      const metaRef = await rtdb.ref(RTDB_PATHS.CHAT_META(chatId));
      await rtdb.update(metaRef, { uploadedWallpapers: updated } as any);
      // Optimistic local update
      const newMap = new Map(this.chats);
      newMap.set(chatId, { ...meta, uploadedWallpapers: updated });
      this.chats = newMap;
      toastStore.info('Wallpaper removed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[removeChatUploadedWallpaper]', msg);
    }
  }

  // ============================================================
  // Reactions
  // ============================================================

  /** Attach per-message reaction listeners for all current messages */
  private async attachReactionListeners(chatId: string): Promise<void> {
    this.detachReactionListeners();
    // Listen for reactions on each message we currently have
    for (const msg of this.messages) {
      this.attachSingleReactionListener(chatId, msg.id);
    }
  }

  /** Listen for reactions on a single message */
  private async attachSingleReactionListener(chatId: string, messageId: string): Promise<void> {
    if (this.reactionUnsubs.has(messageId)) return;

    const r = await rtdb.ref(RTDB_PATHS.REACTIONS(chatId, messageId));

    const unsub = await rtdb.onChildAdded(r, (snap) => {
      const emoji = snap.key;
      if (!emoji) return;
      const data = snap.val() as { uids?: string[] } | null;
      const uids = data?.uids ?? [];
      this.setReaction(messageId, emoji, uids);
    });
    this.reactionUnsubs.set(messageId, unsub);

    const changedUnsub = await rtdb.onChildChanged(r, (snap) => {
      const emoji = snap.key;
      if (!emoji) return;
      const data = snap.val() as { uids?: string[] } | null;
      const uids = data?.uids ?? [];
      this.setReaction(messageId, emoji, uids);
    });
    this.reactionChildChangedUnsubs.set(messageId, changedUnsub);

    const removedUnsub = await rtdb.onChildRemoved(r, (snap) => {
      const emoji = snap.key;
      if (!emoji) return;
      this.removeReaction(messageId, emoji);
    });
    this.reactionChildRemovedUnsubs.set(messageId, removedUnsub);
  }

  /** Update a single reaction entry in the reactions map */
  private setReaction(messageId: string, emoji: string, uids: string[]): void {
    const newMap = new Map(this.reactions);
    const existing = newMap.get(messageId) ?? [];
    const filtered = existing.filter(r => r.emoji !== emoji);
    if (uids.length > 0) {
      filtered.push({ emoji, uids });
    }
    newMap.set(messageId, filtered);
    this.reactions = newMap;
  }

  /** Remove a reaction entry from the reactions map */
  private removeReaction(messageId: string, emoji: string): void {
    const newMap = new Map(this.reactions);
    const existing = newMap.get(messageId) ?? [];
    newMap.set(messageId, existing.filter(r => r.emoji !== emoji));
    this.reactions = newMap;
  }

  private detachReactionListeners(): void {
    for (const [, unsub] of this.reactionUnsubs) unsub();
    this.reactionUnsubs.clear();
    for (const [, unsub] of this.reactionChildChangedUnsubs) unsub();
    this.reactionChildChangedUnsubs.clear();
    for (const [, unsub] of this.reactionChildRemovedUnsubs) unsub();
    this.reactionChildRemovedUnsubs.clear();
    this.reactions = new Map();
  }

  /** Toggle a reaction on a message. Adds or removes based on current state. Optimistic local update. */
  async toggleReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    // Read current uids from LOCAL state (no RTDB read — use what we already have)
    const currentReactions = this.reactions.get(messageId) ?? [];
    const existingReaction = currentReactions.find(r => r.emoji === emoji);
    const currentUids = existingReaction?.uids ?? [];

    const alreadyReacted = currentUids.includes(user.id);
    let newUids: string[];

    if (alreadyReacted) {
      newUids = currentUids.filter(id => id !== user.id);
    } else {
      newUids = [...currentUids, user.id];
    }

    // Optimistic: update local state immediately
    this.setReaction(messageId, emoji, newUids);

    const reactionPath = RTDB_PATHS.REACTIONS(chatId, messageId) + '/' + emoji;

    try {
      if (newUids.length === 0) {
        await rtdb.remove(await rtdb.ref(reactionPath));
      } else {
        await rtdb.set(await rtdb.ref(reactionPath), { uids: newUids });
      }
    } catch (err) {
      // Revert on failure
      this.setReaction(messageId, emoji, currentUids);
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[toggleReaction]', msg);
      toastStore.error(`Reaction failed: ${msg.slice(0, 60)}`);
    }
  }

  /** Get reactions for a specific message */
  getReactions(messageId: string): Reaction[] {
    return this.reactions.get(messageId) ?? [];
  }

  /** Check if the current user has reacted with a specific emoji on a message */
  hasReacted(messageId: string, emoji: string): boolean {
    const uid = authStore.user?.id;
    if (!uid) return false;
    const rxs = this.reactions.get(messageId) ?? [];
    return rxs.some(r => r.emoji === emoji && r.uids.includes(uid));
  }

  /** Get a flat count of all reactions on a message */
  getReactionCount(messageId: string): number {
    const rxs = this.reactions.get(messageId) ?? [];
    return rxs.reduce((sum, r) => sum + r.uids.length, 0);
  }
}

/** Singleton instance */
export const chatStore = new ChatStore();

networkManager.onDormant(() => chatStore.detachHighFrequencyListeners());
networkManager.onActive(() => chatStore.reattachListeners());