// ============================================================
// Chat — Canonical Type Definitions
// PRD §IV.2 — Schema Architecture mirrors these types 1:1
// ============================================================

/* ---------- User ---------- */
export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'online' | 'offline' | 'away';
  lastSeen: number; // epoch ms
  createdAt: number;
  // NEW profile customization fields:
  bio?: string | null;          // Short bio/about me, max 120 chars
  accentColor?: string | null;  // Hex color for chat bubbles (e.g. "#6366f1")
  emojiStatus?: string | null;  // Mood emoji (e.g. "🔥", "😊")
}

/* ---------- Chat ---------- */
export type ChatType = 'direct';

export interface ChatMeta {
  id: string;
  type: ChatType;
  participantIds: string[];
  /** Minified key per PRD §IV.2 */
  lm: string | null;   // last message content snippet
  ts: number;           // last message timestamp
  updatedAt: number;
  /** Per-chat wallpaper: preset ID, URL, or null for default */
  wallpaper?: string | null;
}

/* ---------- Message ---------- */
export type MessageType = 'text' | 'image' | 'voice' | 'system';

export interface Message {
  id: string;
  c: string;           // content (minified key)
  sid: string;         // senderId
  t: MessageType;      // type
  ts: number;          // server timestamp (epoch ms)
  rk: string;          // idempotency key (UUIDv4)
  rid: string | null;  // replyTo message id
  /** media-specific */
  mu: string | null;   // mediaUrl
  mh: string | null;   // mediaHash (blurhash)
  md: Record<string, unknown> | null; // mediaDimensions / metadata
  edited: boolean;      // whether message has been edited
}

/* ---------- Inbox (user_chats) ---------- */
export interface UserChat {
  chatId: string;
  uid: string;
  lrid: string | null;  // lastReadMessageId
  uc: number;           // unreadCount
  jt: number;           // joinedAt timestamp
  muted?: boolean;
  pinned?: boolean;
}

/* ---------- Presence ---------- */
export interface PresenceState {
  uid: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: number;
  typing: boolean;
}

/* ---------- Auth ---------- */
export interface AuthCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  userId: string;
  username: string;
  displayName: string;
  token: string; // Firebase custom token
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/* ---------- Network (PRD §III) ---------- */
export type ConnectionState = 'active' | 'dormant' | 'disconnected';

/* ---------- Theme (PRD §VI, §VII) ---------- */
export type ThemeMode = 'light' | 'dark' | 'amoled' | 'crimson';

/* ---------- Gesture ---------- */
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface GestureState {
  isSwiping: boolean;
  direction: SwipeDirection | null;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
}

/* ---------- Upload ---------- */
export interface UploadTask {
  id: string;
  file: File;
  chatId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  url: string | null;
  blurhash: string | null;
}

/* ---------- Media ---------- */
export interface VoiceRecording {
  blob: Blob;
  url: string;
  duration: number;
}

/* ---------- Reaction ---------- */
export interface Reaction {
  emoji: string;
  uids: string[]; // user IDs who reacted with this emoji
}

/* ---------- RTDB paths (PRD §IV.2) ---------- */
export const RTDB_PATHS = {
  CHAT_META: (chatId: string) => `chats/${chatId}/meta`,
  CHAT_MESSAGES: (chatId: string) => `chats/${chatId}/messages`,
  USER_CHATS: (uid: string) => `user_chats/${uid}`,
  USER_CHAT_ENTRY: (uid: string, chatId: string) => `user_chats/${uid}/${chatId}`,
  USER_PROFILE: (uid: string) => `users/${uid}`,
  PRESENCE: (uid: string) => `presence/${uid}`,
  TYPING: (chatId: string, uid: string) => `typing/${chatId}/${uid}`,
  PINNED: (chatId: string) => `chats/${chatId}/pinned`,
  STARRED: (uid: string, chatId: string) => `starred/${uid}/${chatId}`,
  REACTIONS: (chatId: string, messageId: string) => `reactions/${chatId}/${messageId}`,
  SCHEMA_VERSION: '_schema/v',
} as const;

/* ---------- Pinned Message ---------- */
export interface PinnedMessage {
  messageId: string;
  pinnedBy: string;
  pinnedAt: number;
  message: Message;
}

export const SCHEMA_VERSION = 1;
export const MAX_MESSAGES_IN_MEMORY = 50;
export const DORMANT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const TYPING_DEBOUNCE_MS = 2000;