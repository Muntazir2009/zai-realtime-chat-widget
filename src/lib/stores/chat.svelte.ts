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
import { prefsStore } from './prefs.svelte.js';
import { uiStore } from './ui.svelte.js';
import { networkManager } from '$lib/managers/NetworkManager.svelte.js';
import { cacheMessages, getCachedMessages, cacheUserProfiles, getUserProfile, clearChat as clearCachedMessages } from '$lib/managers/CacheManager.js';
import { generateIdempotencyKey } from '$lib/utils/idempotency.js';
import { playMessageSound } from '$lib/utils/message-sound.js';

// ── Network resilience: retry with exponential backoff ──

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s
        console.warn(`[${label}] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function formatVideoDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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
  // Typing: simple reactive array for the ACTIVE chat only.
  // Reassigned on every change to guarantee Svelte 5 reactivity.
  activeTypingNames: string[] = $state([]);
  // Keep a Map for non-active chats too (used by inbox preview if needed)
  typingDisplayNames: Map<string, string[]> = $state(new Map()); // chatId → [displayNames]
  private _typingUids: Map<string, Set<string>> = new Map(); // internal tracking (non-reactive)

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
  private typingRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private typingRetryCount: number = 0;
  // Global typing listeners — persist across chat switches
  private globalTypingUnsubs: Map<string, Map<string, () => void>> = new Map(); // chatId → Map<uid, unsub>
  private globalTypingRetryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private otherReadUnsub: (() => void) | null = null;

  // ---- Self profile listener ----
  private selfProfileUnsub: (() => void) | null = null;

  // ---- Pinned messages ----
  pinnedMessages: Map<string, Message> = $state(new Map());
  pinnedMeta: Map<string, { pinnedBy: string; pinnedAt: number }> = $state(new Map());
  private pinnedUnsub: (() => void) | null = null;
  private pinnedRemovedUnsub: (() => void) | null = null;

  // ---- Starred messages ----
  starredMessageIds: Set<string> = $state(new Set());
  private starredUnsub: (() => void) | null = null;

  // ---- Reactions ----
  reactions: Map<string, Reaction[]> = $state(new Map()); // messageId → reactions[]
  private reactionUnsubs: Map<string, () => void> = new Map();

  // ---- Idempotency tracking (bounded to prevent memory leak) ----
  private sentKeys = new Set<string>();
  private static readonly MAX_SENT_KEYS = 500;

  // ---- Message-sound bookkeeping ----
  // Track self-sent message timestamps per chat so we can distinguish
  // meta updates triggered by our own sends (via fan-out) from those
  // triggered by the other user's incoming messages. The ChatMeta
  // schema doesn't include the sender id of the last message, so we
  // use this to suppress the message-sound for our own sends.
  private selfMessageTsByChat = new Map<string, number[]>();
  // Last observed `meta.ts` per chat — used to detect when a new
  // message has arrived (i.e. when `meta.ts` increases).
  private lastMetaTsByChat = new Map<string, number>();

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

  /** Record a self-sent message timestamp so the meta listener can
   *  suppress the message sound for our own outgoing messages. */
  private recordSelfMessage(chatId: string, ts: number): void {
    const arr = this.selfMessageTsByChat.get(chatId) ?? [];
    arr.push(ts);
    // Keep only timestamps from the last 5 minutes (bounded memory)
    const cutoff = Date.now() - 5 * 60 * 1000;
    const filtered = arr.filter((t) => t > cutoff);
    this.selfMessageTsByChat.set(chatId, filtered);
  }

  /** Returns true if `ts` matches a self-sent message timestamp for
   *  `chatId` (within a 2s tolerance for clock drift between client
   *  and server). */
  private isSelfMessageTs(chatId: string, ts: number): boolean {
    const arr = this.selfMessageTsByChat.get(chatId);
    if (!arr || arr.length === 0) return false;
    return arr.some((t) => Math.abs(t - ts) < 2000);
  }

  /** Derive sorted inbox. Respects user's chat sort order preference. */
  sortedInbox = $derived.by(() => {
    const entries = Array.from(this.userChats.entries());
    const order = prefsStore.chatSortOrder;

    entries.sort((a, b) => {
      const metaA = this.chats.get(a[1].chatId);
      const metaB = this.chats.get(b[1].chatId);

      if (order === 'alphabetical') {
        const otherA = metaA?.participantIds?.find((p: string) => p !== authStore.user?.id) ?? '';
        const otherB = metaB?.participantIds?.find((p: string) => p !== authStore.user?.id) ?? '';
        const nameA = this.userDict.get(otherA)?.displayName ?? '';
        const nameB = this.userDict.get(otherB)?.displayName ?? '';
        return nameA.localeCompare(nameB);
      }

      if (order === 'unread') {
        const unreadA = a[1].uc ?? 0;
        const unreadB = b[1].uc ?? 0;
        if (unreadA !== unreadB) return unreadB - unreadA;
      }

      // Default: recent (most recent first)
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

    // Attach global typing listeners for all inbox chats
    this.attachAllInboxTypingListeners().catch(() => {});
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
        // Attach global typing listener for inbox preview
        this.attachGlobalTypingListener(chatId).catch(() => {});
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

        // ── In-app message sound trigger ──
        // The chat-meta listener is attached for EVERY chat in the user's
        // inbox (via loadInbox → onChildAdded → attachChatMetaListener),
        // so this fires for incoming messages in chats the user is NOT
        // currently viewing as well. ChatMeta doesn't include the sender
        // id of the last message, so we suppress our own sends by checking
        // `selfMessageTsByChat` (recorded by sendMessage/sendImage/etc.).
        const prevTs = this.lastMetaTsByChat.get(chatId);
        this.lastMetaTsByChat.set(chatId, meta.ts);
        if (
          prevTs !== undefined &&
          meta.ts > prevTs &&
          prefsStore.messageSound &&
          !this.isSelfMessageTs(chatId, meta.ts)
        ) {
          const isViewingThisChat =
            uiStore.view === 'conversation' && this.activeChatId === chatId;
          if (!isViewingThisChat) {
            playMessageSound();
          }
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
      // Attach global typing listener for inbox preview
      this.attachGlobalTypingListener(chatId).catch(() => {});
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

    // Refresh activeTypingNames from existing map (if typing was tracked before open)
    this.activeTypingNames = (this.typingDisplayNames.get(chatId) ?? []).slice();

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

      // ── Message sound (defensive double-trigger) ──
      // The primary sound trigger lives in `attachChatMetaListener`,
      // which fires for ALL inbox chats (including the active one).
      // For the active chat the meta-listener's `isViewingThisChat`
      // check correctly suppresses the sound. We keep this explicit
      // per-message check here as a defensive guard for the rare case
      // where the meta listener's `meta.ts` comparison misses (e.g.
      // clock-skew edge cases) — when the user is actively viewing
      // this chat we never want a sound.
      if (
        msg.sid !== authStore.user?.id &&
        msg.t !== 'system' &&
        prefsStore.messageSound
      ) {
        const isViewingThisChat =
          uiStore.view === 'conversation' && this.activeChatId === chatId;
        if (!isViewingThisChat) {
          playMessageSound();
        }
      }
    });

    // Listen for message changes (edits, pin state sync)
    this.messageChangedUnsub = await rtdb.onChildChanged(msgRef, (snap) => {
      const raw = snap.val() as Message;
      if (!raw) return;
      const msg: Message = { ...raw, edited: raw.edited ?? false };
      const idx = this.messages.findIndex((m) => m.id === msg.id);
      if (idx !== -1) {
        const existing = this.messages[idx]!;
        // Skip if the content already matches our optimistic update —
        // prevents a visual flicker when our own edit echoes back from RTDB.
        if (existing.c === msg.c && existing.edited === msg.edited) return;
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
    // Global typing listeners are already attached via inbox/meta hooks.
    // One-shot direct read as fallback to catch edge cases.
    this._readTypingStateDirect(chatId).catch(() => {});
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
    // Don't detach global typing listeners — they persist for inbox preview
    this.activeTypingNames = [];
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

      // Clean up global typing listener for this chat
      this.detachGlobalTypingListener(chatId);
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
      lrid: prefsStore.sendReadReceipts ? messageId : (senderUC?.lrid ?? null),
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

    // Record self-sent message ts so the meta-listener can suppress
    // the in-app message sound for our own outgoing message.
    this.recordSelfMessage(chatId, message.ts);

    const updates = this.buildFanOutUpdates(chatId, messageId, message, content.slice(0, 100));
    // Optimistic: add to local array immediately so UI updates instantly
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
    await retryWithBackoff(
      async () => rtdb.update(await rtdb.ref('/'), updates),
      'sendMessage'
    ).catch((err) => {
      console.error('[sendMessage] All retries failed:', err);
      toastStore.error('Failed to send message. Check your connection.');
      this.messages = this.messages.filter((m) => m.id !== messageId);
    });
  }

  /** Send an image message */
  async sendImageMessage(chatId: string, imageUrl: string, caption?: string, blurhash?: string, viewOnce?: boolean): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (!this.addSentKey(idempotencyKey)) return;

    const msgRef = await rtdb.push(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const message: Message = {
      id: messageId, c: caption ?? '📷 Photo', sid: user.id, t: 'image', ts: Date.now(),
      rk: idempotencyKey, rid: null, mu: imageUrl, mh: blurhash ?? null, md: null, edited: false,
      vo: viewOnce || undefined,
    };

    this.recordSelfMessage(chatId, message.ts);

    const updates = this.buildFanOutUpdates(chatId, messageId, message, caption ?? '📷 Photo');
    // Optimistic: add to local array immediately
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
    await retryWithBackoff(
      async () => rtdb.update(await rtdb.ref('/'), updates),
      'sendImageMessage'
    ).catch((err) => {
      console.error('[sendImageMessage] All retries failed:', err);
      toastStore.error('Failed to send photo. Check your connection.');
      this.messages = this.messages.filter((m) => m.id !== messageId);
    });
  }

  /** Send a video message */
  async sendVideoMessage(chatId: string, videoUrl: string, duration: number = 0, thumbnailUrl?: string): Promise<void> {
    const user = authStore.user;
    if (!user) return;

    const idempotencyKey = generateIdempotencyKey();
    if (!this.addSentKey(idempotencyKey)) return;

    const msgRef = await rtdb.push(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));
    const messageId = msgRef.key ?? idempotencyKey;

    const durStr = duration > 0 ? formatVideoDuration(duration) : '';
    const message: Message = {
      id: messageId, c: '🎬 Video', sid: user.id, t: 'video', ts: Date.now(),
      rk: idempotencyKey, rid: null, mu: videoUrl, mh: thumbnailUrl ?? null,
      md: { duration, thumbnailUrl }, edited: false,
    };

    this.recordSelfMessage(chatId, message.ts);

    const updates = this.buildFanOutUpdates(chatId, messageId, message, `🎬 Video ${durStr}`);
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
    await retryWithBackoff(
      async () => rtdb.update(await rtdb.ref('/'), updates),
      'sendVideoMessage'
    ).catch((err) => {
      console.error('[sendVideoMessage] All retries failed:', err);
      toastStore.error('Failed to send video. Check your connection.');
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

    this.recordSelfMessage(chatId, message.ts);

    const updates = this.buildFanOutUpdates(chatId, messageId, message, '🎙 Voice message');
    // Optimistic: add to local array immediately
    this.messages = [...this.messages, message].sort((a, b) => a.ts - b.ts);
    await retryWithBackoff(
      async () => rtdb.update(await rtdb.ref('/'), updates),
      'sendVoiceMessage'
    ).catch((err) => {
      console.error('[sendVoiceMessage] All retries failed:', err);
      toastStore.error('Failed to send voice message. Check your connection.');
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

    // Attach global typing listener for inbox preview
    this.attachGlobalTypingListener(chatId).catch(() => {});

    return chatId;
  }

  // ============================================================
  // Mark as read
  // ============================================================

  async markAsRead(chatId: string): Promise<void> {
    const user = authStore.user;
    if (!user || !prefsStore.sendReadReceipts) return;

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
    this.typingRetryCount = 0; // reset retry counter on fresh attach
    await this._doAttachTypingListener(chatId);
    // Fallback: directly read the typing state for each other user.
    // This catches edge cases where the onValue initial callback is missed
    // (e.g., race between detach and attach, or Firebase SDK timing).
    await this._readTypingStateDirect(chatId);
  }

  /** One-shot direct read of typing state for all other users in the chat.
   *  Updates the internal tracking and reactive display names immediately. */
  private async _readTypingStateDirect(chatId: string): Promise<void> {
    const meta = this.chats.get(chatId);
    if (!meta) return;
    const myUid = authStore.user?.id;
    const otherUids = meta.participantIds.filter(uid => uid !== myUid);
    const listenUids = otherUids.length > 0 ? otherUids
      : this.participants.filter(p => p.id !== myUid).map(p => p.id);
    for (const uid of listenUids) {
      try {
        const r = await rtdb.ref(RTDB_PATHS.TYPING(chatId, uid));
        const snap = await rtdb.get(r);
        this._handleTypingSnapshot(chatId, uid, snap);
      } catch {
        // Best-effort — the onValue listener is the primary mechanism
      }
    }
  }

  /** Internal: actually attach the Firebase typing listeners. Uses persistent retry
   *  with capped exponential backoff (1s, 2s, 4s, 8s, 10s, 10s…). Only stops
   *  retrying if the chat is no longer in the user's chats or userChats.
   *  Stores unsubs in globalTypingUnsubs so they persist across chat switches. */
  private async _doAttachTypingListener(chatId: string, retryCount = 0): Promise<void> {
    // If already attached globally, nothing to do
    if (this.globalTypingUnsubs.has(chatId)) return;

    const meta = this.chats.get(chatId);
    if (!meta || !meta.participantIds || meta.participantIds.length === 0) {
      // Only stop retrying if the chat is no longer in any of our lists
      const stillRelevant = this.chats.has(chatId) || this.userChats.has(chatId);
      if (!stillRelevant) {
        console.log('[ChatStore] Typing: chat no longer relevant, stopping retry for', chatId);
        return;
      }
      // Capped exponential backoff: 1s, 2s, 4s, 8s, 10s, 10s, 10s…
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      console.warn(`[ChatStore] Typing: meta not available for ${chatId} - retry #${retryCount + 1} in ${delay}ms`);
      this._clearGlobalTypingRetryTimer(chatId);
      const timer = setTimeout(() => {
        this.globalTypingRetryTimers.delete(chatId);
        this._doAttachTypingListener(chatId, retryCount + 1).catch(() => {});
      }, delay);
      this.globalTypingRetryTimers.set(chatId, timer);
      return;
    }

    // Clear any pending retry timer for this chat
    this._clearGlobalTypingRetryTimer(chatId);

    // Double-check not already attached (race guard)
    if (this.globalTypingUnsubs.has(chatId)) return;

    this.typingSafetyTimeouts.set(chatId, new Map());
    const myUid = authStore.user?.id;

    // Only listen for OTHER users' typing (skip own UID)
    const otherUids = meta.participantIds.filter(uid => uid !== myUid);
    console.log('[ChatStore] Attaching GLOBAL typing listeners for', otherUids.length, 'users in chat', chatId);

    // Fallback: if no other users found (edge case), try participants list
    const fallbackUids = otherUids.length === 0
      ? this.participants.filter(p => p.id !== myUid).map(p => p.id)
      : [];
    const listenUids = otherUids.length > 0 ? otherUids : fallbackUids;
    if (listenUids.length === 0) {
      console.warn('[ChatStore] No other users to listen for typing in chat', chatId);
      return;
    }

    const chatUnsubs = new Map<string, () => void>();
    for (const uid of listenUids) {
      try {
        const r = await rtdb.ref(RTDB_PATHS.TYPING(chatId, uid));
        const unsub = await rtdb.onValue(r, (snap) => {
          this._handleTypingSnapshot(chatId, uid, snap);
        });
        chatUnsubs.set(uid, unsub);
        console.log('[ChatStore] Global typing listener attached OK for uid=', uid, 'chat=', chatId);
      } catch (err) {
        console.error('[ChatStore] Failed to attach global typing listener for uid=', uid, 'chat=', chatId, err);
      }
    }
    if (chatUnsubs.size > 0) {
      this.globalTypingUnsubs.set(chatId, chatUnsubs);
    } else if (listenUids.length > 0) {
      console.error('[ChatStore] WARNING: 0 global typing listeners attached out of', listenUids.length, 'for chat', chatId);
    }
  }

  /** Process a typing snapshot and update reactive display names.
   *  Always updates the reactive state to prevent edge cases where the
   *  `onValue` initial callback is missed or a state transition races. */
  private _handleTypingSnapshot(chatId: string, uid: string, snap: any): void {
    const myUid = authStore.user?.id;
    let isTyping = false;

    if (snap.exists()) {
      const raw = snap.val();
      // Support both formats:
      //   - Number (timestamp): 1715234567890
      //   - Object (legacy):   { typing: true, ts: 1715234567890 }
      // 15-second window accounts for clock skew and Firebase delivery latency.
      if (typeof raw === 'number') {
        isTyping = raw > 0 && (Date.now() - raw) < 15000;
      } else if (raw && (raw.typing === true || (raw.ts && typeof raw.ts === 'number' && Date.now() - raw.ts < 15000))) {
        isTyping = true;
      }
    }

    // Clear existing safety timeout for this user
    this.clearTypingSafetyTimeout(chatId, uid);

    // Get or create the internal typing set
    let uidSet = this._typingUids.get(chatId);
    if (!uidSet) {
      uidSet = new Set();
      this._typingUids.set(chatId, uidSet);
    }

    if (isTyping) {
      uidSet.add(uid);
      // Safety timeout: auto-remove after 5s even if no stop event
      const timeout = setTimeout(() => {
        uidSet.delete(uid);
        this._updateTypingDisplayNames(chatId);
        const timeouts = this.typingSafetyTimeouts.get(chatId);
        if (timeouts) timeouts.delete(uid);
      }, 5000);
      const chatTimeouts = this.typingSafetyTimeouts.get(chatId);
      if (chatTimeouts) chatTimeouts.set(uid, timeout);
    } else {
      uidSet.delete(uid);
    }

    // Always update reactive state — never skip updates.
    // This prevents edge cases where the `onValue` initial callback
    // races with `detachTypingListener` or where a state transition
    // is missed due to timing.
    this._updateTypingDisplayNames(chatId);
  }

  /** Sync the internal _typingUids set to the reactive typingDisplayNames map
   *  AND the activeTypingNames array (for the currently active chat) */
  private _updateTypingDisplayNames(chatId: string): void {
    const uidSet = this._typingUids.get(chatId);
    const myUid = authStore.user?.id;
    let names: string[] = [];
    if (uidSet && uidSet.size > 0) {
      names = Array.from(uidSet)
        .filter(uid => uid !== myUid)
        .map(uid => this.userDict.get(uid)?.displayName ?? 'Someone');
    }

    // Update the Map (for inbox/other chats) — persists across chat switches
    const m = new Map(this.typingDisplayNames);
    if (names.length === 0) {
      m.delete(chatId);
    } else {
      m.set(chatId, names);
    }
    this.typingDisplayNames = m;

    // Update the simple reactive array for the ACTIVE chat — this is what
    // the Conversation component reads. Reassigning an array is the most
    // reliable way to trigger Svelte 5 reactivity.
    if (this.activeChatId === chatId) {
      console.log('[ChatStore] activeTypingNames updated:', names, 'for chat', chatId, '(activeChatId:', this.activeChatId, ')');
      this.activeTypingNames = names.slice();
    } else {
      console.log('[ChatStore] Typing update for non-active chat', chatId, '- stored in map but not shown');
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
    // Clear retry timer
    if (this.typingRetryTimer) {
      clearTimeout(this.typingRetryTimer);
      this.typingRetryTimer = null;
    }
    // Clear internal typing UIDs (non-reactive tracking)
    this._typingUids.clear();
    // Clear the reactive array for the active chat so the UI updates immediately.
    // Do NOT clear the entire typingDisplayNames map — other chats' typing state
    // is preserved so switching back can restore it from the map.
    if (this.activeTypingNames.length > 0) {
      this.activeTypingNames = [];
    }
  }

  // ---- Global typing listener management ----

  /** Attach a global typing listener for a chat that persists across chat switches.
   *  Used for inbox preview and ensures typing state is always available when
   *  opening any chat. Uses persistent retry with capped exponential backoff. */
  async attachGlobalTypingListener(chatId: string): Promise<void> {
    // Skip if already attached
    if (this.globalTypingUnsubs.has(chatId)) return;
    await this._doAttachTypingListener(chatId);
    // One-shot fallback: directly read the typing state to catch edge cases
    // where the onValue initial callback is missed.
    await this._readTypingStateDirect(chatId);
  }

  /** Remove all global typing listeners for a specific chat. */
  private detachGlobalTypingListener(chatId: string): void {
    const chatUnsubs = this.globalTypingUnsubs.get(chatId);
    if (chatUnsubs) {
      for (const [, unsub] of chatUnsubs) unsub();
      this.globalTypingUnsubs.delete(chatId);
    }
    this._clearGlobalTypingRetryTimer(chatId);
    // Clear safety timeouts for this chat
    const timeouts = this.typingSafetyTimeouts.get(chatId);
    if (timeouts) {
      for (const [, t] of timeouts) clearTimeout(t);
      this.typingSafetyTimeouts.delete(chatId);
    }
    // Clear typing UIDs tracking for this chat
    this._typingUids.delete(chatId);
    // Clear display names for this chat
    const m = new Map(this.typingDisplayNames);
    m.delete(chatId);
    this.typingDisplayNames = m;
    // Clear active names if this was the active chat
    if (this.activeChatId === chatId) {
      this.activeTypingNames = [];
    }
  }

  /** Clear a pending global typing retry timer for a specific chat. */
  private _clearGlobalTypingRetryTimer(chatId: string): void {
    const timer = this.globalTypingRetryTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.globalTypingRetryTimers.delete(chatId);
    }
  }

  /** Attach global typing listeners for ALL chats currently in the inbox. */
  async attachAllInboxTypingListeners(): Promise<void> {
    for (const chatId of this.userChats.keys()) {
      this.attachGlobalTypingListener(chatId).catch(() => {});
    }
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
    // Global typing listeners are low-frequency — keep them during dormant
  }

  async reattachListeners(): Promise<void> {
    // Global typing listeners persist across network transitions — no reattach needed
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
    // Reset per-chat sound bookkeeping so a fresh login doesn't carry
    // over stale "last meta ts" state from a previous session.
    this.lastMetaTsByChat.clear();
    this.selfMessageTsByChat.clear();
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
          // Sync authStore.user too so the current user's own avatar/name
          // updates in realtime across devices (and persists to localStorage).
          if (authStore.user?.id === uid) {
            authStore.updateUser(user);
          }
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
    // Clean up ALL global typing listeners
    for (const [chatId, chatUnsubs] of this.globalTypingUnsubs) {
      for (const [, unsub] of chatUnsubs) unsub();
    }
    this.globalTypingUnsubs.clear();
    for (const [, timer] of this.globalTypingRetryTimers) clearTimeout(timer);
    this.globalTypingRetryTimers.clear();
    // Clean up all safety timeouts
    for (const [, chatTimeouts] of this.typingSafetyTimeouts) {
      for (const [, t] of chatTimeouts) clearTimeout(t);
    }
    this.typingSafetyTimeouts.clear();
    // Full reset: clear ALL typing state on logout
    this._typingUids.clear();
    if (this.typingDisplayNames.size > 0) {
      this.typingDisplayNames = new Map();
    }
    if (this.activeTypingNames.length > 0) {
      this.activeTypingNames = [];
    }
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
    const set = this._typingUids.get(chatId);
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
      // Track pinned metadata
      const newMeta = new Map(this.pinnedMeta);
      newMeta.set(data.messageId, { pinnedBy: data.pinnedBy, pinnedAt: data.pinnedAt });
      this.pinnedMeta = newMeta;
    });

    this.pinnedRemovedUnsub = await rtdb.onChildRemoved(r, (snap) => {
      const msgId = snap.key;
      if (!msgId) return;
      const newMap = new Map(this.pinnedMessages);
      newMap.delete(msgId);
      this.pinnedMessages = newMap;
      const newMeta = new Map(this.pinnedMeta);
      newMeta.delete(msgId);
      this.pinnedMeta = newMeta;
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
    this.pinnedMeta = new Map();
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
      const newMeta = new Map(this.pinnedMeta);
      newMeta.delete(msg.id);
      this.pinnedMeta = newMeta;
    } else if (this.pinnedMessages.size < 3) {
      const newMap = new Map(this.pinnedMessages);
      newMap.set(msg.id, msg);
      this.pinnedMessages = newMap;
      const newMeta = new Map(this.pinnedMeta);
      newMeta.set(msg.id, { pinnedBy: user.id, pinnedAt: Date.now() });
      this.pinnedMeta = newMeta;
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
        const newMeta = new Map(this.pinnedMeta);
        newMeta.set(msg.id, { pinnedBy: user.id, pinnedAt: Date.now() });
        this.pinnedMeta = newMeta;
      } else {
        const newMap = new Map(this.pinnedMessages);
        newMap.delete(msg.id);
        this.pinnedMessages = newMap;
        const newMeta = new Map(this.pinnedMeta);
        newMeta.delete(msg.id);
        this.pinnedMeta = newMeta;
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
  // Clear chat — remove ALL messages (RTDB + cache), keep metadata
  // ============================================================

  /**
   * Clear every message in a chat.
   *
   * - Optimistically empties the local `messages` array so the UI updates instantly.
   * - Removes ALL messages from RTDB at `chats/${chatId}/messages`. The existing
   *   `onChildRemoved` listener (attached in `openChat`) fires per-message so other
   *   devices/tabs stay in sync.
   * - Clears the IndexedDB cache for that chat (so stale messages don't return on
   *   the next `openChat`).
   * - Clears reactions (`reactions/${chatId}`) and pinned messages
   *   (`chats/${chatId}/pinned`) — best-effort, errors are swallowed.
   * - Clears the inbox preview (`meta.lm`) to null.
   * - Conversation metadata (participants, wallpaper, uploadedWallpapers, ts,
   *   updatedAt, etc.) is intentionally left intact.
   */
  async clearChat(chatId: string): Promise<void> {
    // 1) Optimistic: clear local array immediately
    const prevMessages = this.messages;
    this.messages = [];
    try {
      // 2) Clear IndexedDB cache for this chat (stale message cache)
      clearCachedMessages(chatId);

      // 3) Remove ALL messages from RTDB
      await rtdb.remove(await rtdb.ref(RTDB_PATHS.CHAT_MESSAGES(chatId)));

      // 4) Clear reactions (best-effort)
      await rtdb.remove(await rtdb.ref('reactions/' + chatId)).catch(() => {
        // Best-effort — don't fail the clear
      });

      // 5) Clear pinned messages (best-effort)
      await rtdb.remove(await rtdb.ref(RTDB_PATHS.PINNED(chatId))).catch(() => {
        // Best-effort — don't fail the clear
      });

      // 6) Clear inbox preview (lm) — fan-out update; leave other meta intact
      await rtdb
        .update(await rtdb.ref('/'), {
          [RTDB_PATHS.CHAT_META(chatId) + '/lm']: null,
        })
        .catch(() => {
          // Best-effort meta update — don't fail the clear
        });

      toastStore.success('Chat cleared');
    } catch (err) {
      // Revert local state on hard failure (RTDB messages remove failed)
      this.messages = prevMessages;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[clearChat]', msg);
      toastStore.error('Failed to clear chat');
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

  /** Listen for reactions on a single message — single onValue instead of 3 child listeners */
  private async attachSingleReactionListener(chatId: string, messageId: string): Promise<void> {
    if (this.reactionUnsubs.has(messageId)) return;

    const r = await rtdb.ref(RTDB_PATHS.REACTIONS(chatId, messageId));

    // Single onValue listener replaces 3 separate child listeners (150 → 50 for 50 msgs)
    const unsub = await rtdb.onValue(r, (snap) => {
      // Clear existing reactions for this message
      const msgs = new Map(this.reactions);
      msgs.set(messageId, []);
      this.reactions = msgs;

      if (snap.exists()) {
        snap.forEach((childSnap: any) => {
          const emoji = childSnap.key;
          if (!emoji) return;
          const data = childSnap.val() as { uids?: string[] } | null;
          const uids = data?.uids ?? [];
          if (uids.length > 0) {
            const updated = new Map(this.reactions);
            const existing = updated.get(messageId) ?? [];
            existing.push({ emoji, uids });
            updated.set(messageId, existing);
            this.reactions = updated;
          }
        });
      }
    });
    this.reactionUnsubs.set(messageId, unsub);
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