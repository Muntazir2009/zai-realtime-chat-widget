// ============================================================
// CacheManager — Pure TypeScript (NO Svelte reactivity)
// Uses IndexedDB via the `idb` library for offline-first caching.
// Writes are scheduled via requestIdleCallback for non-blocking I/O.
// ============================================================

import { openDB, type IDBPDatabase } from 'idb';
import type { Message, User } from '$lib/types/index.js';

const DB_NAME = 'zai-chat-cache';
const DB_VERSION = 1;

const STORE_MESSAGES = 'messages';
const STORE_USERS = 'users';

const MAX_CACHED_MESSAGES = 50;

interface CachedMessageEntry {
  chatId: string;
  messages: Message[];
  updatedAt: number;
}

// ---- IDB helpers ----

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          db.createObjectStore(STORE_MESSAGES, { keyPath: 'chatId' });
        }
        if (!db.objectStoreNames.contains(STORE_USERS)) {
          db.createObjectStore(STORE_USERS, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/** Schedule a non-critical write during idle time */
function scheduleIdleWrite(fn: () => Promise<void>): void {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) {
    ric(() => {
      fn().catch((err) => {
        console.warn('[CacheManager] Idle write failed:', err);
      });
    }, { timeout: 5000 });
  } else {
    // Fallback: just run it
    fn().catch((err) => {
      console.warn('[CacheManager] Write failed:', err);
    });
  }
}

// ---- Public API ----

/** Cache the last N messages for a chat (ring buffer) */
export function cacheMessages(chatId: string, messages: Message[]): void {
  scheduleIdleWrite(async () => {
    const db = await getDb();
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);

    // Ring buffer: keep only last MAX_CACHED_MESSAGES
    const trimmed = messages.length > MAX_CACHED_MESSAGES
      ? messages.slice(-MAX_CACHED_MESSAGES)
      : messages;

    const entry: CachedMessageEntry = {
      chatId,
      messages: trimmed,
      updatedAt: Date.now(),
    };

    await store.put(entry);
    await tx.done;
  });
}

/** Retrieve cached messages for a chat */
export async function getCachedMessages(chatId: string): Promise<Message[]> {
  const db = await getDb();
  const entry = await db.get(STORE_MESSAGES, chatId) as CachedMessageEntry | undefined;
  return entry?.messages ?? [];
}

/** Cache a dictionary of user profiles */
export function cacheUserProfiles(users: User[]): void {
  scheduleIdleWrite(async () => {
    const db = await getDb();
    const tx = db.transaction(STORE_USERS, 'readwrite');
    const store = tx.objectStore(STORE_USERS);
    for (const user of users) {
      await store.put(user);
    }
    await tx.done;
  });
}

/** Get a single cached user profile by UID */
export async function getUserProfile(uid: string): Promise<User | null> {
  const db = await getDb();
  return (await db.get(STORE_USERS, uid) as User | undefined) ?? null;
}

/** Clear all cached data for a specific chat */
export function clearChat(chatId: string): void {
  scheduleIdleWrite(async () => {
    const db = await getDb();
    await db.delete(STORE_MESSAGES, chatId);
  });
}

/** Clear all cached data (used during logout) */
export function clearAll(): void {
  scheduleIdleWrite(async () => {
    const db = await getDb();
    const tx = db.transaction([STORE_MESSAGES, STORE_USERS], 'readwrite');
    await tx.objectStore(STORE_MESSAGES).clear();
    await tx.objectStore(STORE_USERS).clear();
    await tx.done;
  });
}