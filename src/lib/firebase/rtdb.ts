// ============================================================
// RTDB — thin wrappers, browser-only.
// All functions are async and call ensureLoaded() first
// to guarantee the firebase/database module is available.
// ============================================================

import { browser } from '$app/environment';
import { getDatabaseInstance, isReady, ensureReady } from './config.js';

type DatabaseReference = any;
type DataSnapshot = any;
type Unsubscribe = () => void;

let fbRef: ((db: any, path: string) => DatabaseReference) | undefined;
let fbSet: (r: DatabaseReference, value: any) => Promise<void>;
let fbUpdate: (r: DatabaseReference, values: Record<string, any>) => Promise<void>;
let fbPush: (r: DatabaseReference, value?: any) => DatabaseReference;
let fbRemove: (r: DatabaseReference) => Promise<void>;
let fbOnValue: ((r: any, cb: (snap: any, prev?: string | null | undefined) => void) => Unsubscribe) | undefined;
let fbOnChildAdded: ((r: any, cb: (snap: any, prev?: string | null | undefined) => void) => Unsubscribe) | undefined;
let fbOnChildChanged: ((r: any, cb: (snap: any, prev?: string | null | undefined) => void) => Unsubscribe) | undefined;
let fbOnChildRemoved: ((r: any, cb: (snap: any) => void) => Unsubscribe) | undefined;
let fbGet: (r: DatabaseReference) => Promise<DataSnapshot>;
let fbLimitToLast: (count: number) => any;
let fbQuery: (ref: DatabaseReference, ...constraints: any[]) => any;
let fbStartAt: (value: any, key?: string) => any;
let fbTransaction: ((r: any, fn: (current: any) => any) => Promise<{ committed: boolean; snapshot: DataSnapshot }>) | undefined;
let fbOff: ((r: any, event?: string, ...args: any[]) => void) | undefined;
let fbOnDisconnect: ((r: any) => { set: (val: any) => Promise<void>; remove: () => Promise<void>; cancel: () => Promise<void> }) | undefined;
let fbServerTimestamp: () => any;

let _loadPromise: Promise<void> | null = null;
let _rtdbLoaded = false;

/** Ensures both the Firebase app is initialized AND the database module is loaded */
function ensureLoaded(): Promise<void> {
  if (_rtdbLoaded && isReady()) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = _doLoad();
  return _loadPromise;
}

async function _doLoad() {
  // CRITICAL: Wait for Firebase app to be fully initialized FIRST.
  // Without this, getDatabaseInstance() returns undefined and all
  // RTDB operations silently use no-op stubs.
  await ensureReady();

  const db = await import('firebase/database');
  fbRef = db.ref;
  fbSet = db.set;
  fbUpdate = db.update;
  fbPush = db.push;
  fbRemove = db.remove;
  fbOnValue = db.onValue;
  fbOnChildAdded = db.onChildAdded;
  fbOnChildChanged = db.onChildChanged;
  fbOnChildRemoved = db.onChildRemoved;
  fbGet = db.get;
  fbLimitToLast = db.limitToLast;
  fbQuery = db.query;
  fbStartAt = db.startAt;
  fbTransaction = db.runTransaction as any;
  fbOff = db.off as any;
  fbOnDisconnect = db.onDisconnect as any;
  fbServerTimestamp = db.serverTimestamp;
  _rtdbLoaded = true;
}

// Eagerly start loading in browser
if (browser) ensureLoaded();

export type { DatabaseReference as Ref, DataSnapshot, Unsubscribe };

export async function ref(path: string): Promise<DatabaseReference> {
  if (!browser) {
    return _stubRef(path);
  }
  // Always await full initialization — do NOT early-return with stub
  // when Firebase is still loading (that was the root cause of all
  // real-time features silently failing).
  await ensureLoaded();
  if (!isReady() || !fbRef) {
    console.warn('[rtdb] ref() called but Firebase not ready, returning stub for:', path);
    return _stubRef(path);
  }
  return fbRef(getDatabaseInstance(), path);
}

function _stubRef(path: string): DatabaseReference {
  return { key: path, parent: null, child: () => null, set: async () => {}, update: async () => {}, push: () => null, remove: async () => {}, onValue: () => () => {}, onChildAdded: () => () => {}, onChildChanged: () => () => {}, onChildRemoved: () => () => {}, get: async () => ({ val: () => null, key: path, exists: () => false, forEach: () => false }) };
}

export async function set(r: DatabaseReference, value: unknown): Promise<void> {
  await ensureLoaded();
  return fbSet(r, value);
}

export async function update(r: DatabaseReference, values: Record<string, unknown>): Promise<void> {
  await ensureLoaded();
  return fbUpdate(r, values);
}

export async function push(r: DatabaseReference, value?: unknown): Promise<DatabaseReference> {
  await ensureLoaded();
  return fbPush(r, value);
}

export async function remove(r: DatabaseReference): Promise<void> {
  await ensureLoaded();
  return fbRemove(r);
}

export async function onValue(r: DatabaseReference, cb: (snap: DataSnapshot) => void): Promise<Unsubscribe> {
  await ensureLoaded();
  return fbOnValue!(r, cb);
}

export async function onChildAdded(r: DatabaseReference, cb: (snap: DataSnapshot, prev?: string | null) => void): Promise<Unsubscribe> {
  await ensureLoaded();
  return fbOnChildAdded!(r, cb);
}

export async function onChildChanged(r: DatabaseReference, cb: (snap: DataSnapshot, prev?: string | null) => void): Promise<Unsubscribe> {
  await ensureLoaded();
  return fbOnChildChanged!(r, cb);
}

export async function onChildRemoved(r: DatabaseReference, cb: (snap: DataSnapshot) => void): Promise<Unsubscribe> {
  await ensureLoaded();
  return fbOnChildRemoved!(r, cb);
}

export async function get(r: DatabaseReference): Promise<DataSnapshot> {
  await ensureLoaded();
  return fbGet(r);
}

export async function query(ref: DatabaseReference, ...constraints: any[]): Promise<DatabaseReference> {
  await ensureLoaded();
  return fbQuery(ref, ...constraints);
}

export async function limitToLast(count: number): Promise<any> {
  await ensureLoaded();
  return fbLimitToLast(count);
}

export async function startAt(value: any, key?: string): Promise<any> {
  await ensureLoaded();
  return fbStartAt(value, key);
}

export function detach(r: DatabaseReference, event?: string): void {
  if (!fbOff) return;
  fbOff(r, event);
}

export async function transaction(
  r: DatabaseReference,
  updateFn: (current: unknown) => unknown,
): Promise<{ committed: boolean; snapshot: DataSnapshot }> {
  await ensureLoaded();
  return fbTransaction!(r, updateFn);
}

export async function onDisconnectSet(r: DatabaseReference, value: unknown): Promise<void> {
  await ensureLoaded();
  if (!fbOnDisconnect) return;
  return fbOnDisconnect(r).set(value);
}

export async function onDisconnectRemove(r: DatabaseReference): Promise<void> {
  await ensureLoaded();
  if (!fbOnDisconnect) return;
  return fbOnDisconnect(r).remove();
}

export async function onDisconnectCancel(r: DatabaseReference): Promise<void> {
  await ensureLoaded();
  if (!fbOnDisconnect) return;
  return fbOnDisconnect(r).cancel();
}

export function serverTimestamp(): any {
  if (!fbServerTimestamp) return Date.now();
  return fbServerTimestamp();
}
