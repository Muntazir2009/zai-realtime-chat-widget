// ============================================================
// RTDB — thin wrappers, browser-only.
// All functions are async and call ensureLoaded() first
// to guarantee the firebase/database module is available.
// ============================================================

import { browser } from '$app/environment';
import { getDatabaseInstance, isReady } from './config.js';

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

let _loadPromise: Promise<void> | null = null;
let _rtdbLoaded = false;

function ensureLoaded(): Promise<void> {
  if (_rtdbLoaded) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = _doLoad();
  return _loadPromise;
}

async function _doLoad() {
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
  _rtdbLoaded = true;
}

// Eagerly start loading in browser
if (browser) ensureLoaded();

export type { DatabaseReference as Ref, DataSnapshot, Unsubscribe };

export async function ref(path: string): Promise<DatabaseReference> {
  if (!browser || !isReady()) {
    return { key: path, parent: null, child: () => null, set: async () => {}, update: async () => {}, push: () => null, remove: async () => {}, onValue: () => () => {}, onChildAdded: () => () => {}, onChildChanged: () => () => {}, onChildRemoved: () => () => {}, get: async () => ({ val: () => null, key: path, exists: () => false, forEach: () => false }) };
  }
  await ensureLoaded();
  return fbRef!(getDatabaseInstance(), path);
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
