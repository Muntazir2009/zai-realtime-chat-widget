// ============================================================
// RTDB — thin wrappers, browser-only.
// Dynamic imports to prevent SSR evaluation.
// ============================================================

import { browser } from '$app/environment';
import { getDatabaseInstance, isReady } from './config.js';

type DatabaseReference = any;
type DataSnapshot = any;
type Unsubscribe = () => void;

let fbRef: (db: any, path: string) => DatabaseReference;
let fbSet: (r: DatabaseReference, value: any) => Promise<void>;
let fbUpdate: (r: DatabaseReference, values: Record<string, any>) => Promise<void>;
let fbPush: (r: DatabaseReference, value?: any) => DatabaseReference;
let fbRemove: (r: DatabaseReference) => Promise<void>;
let fbOnValue: (r: DatabaseReference, cb: (snap: any) => void) => Unsubscribe;
let fbOnChildAdded: (r: DatabaseReference, cb: (snap: any, prev: string | null) => void) => Unsubscribe;
let fbOnChildChanged: (r: DatabaseReference, cb: (snap: any, prev: string | null) => void) => Unsubscribe;
let fbOnChildRemoved: (r: DatabaseReference, cb: (snap: any) => void) => Unsubscribe;
let fbGet: (r: DatabaseReference) => Promise<DataSnapshot>;
let fbLimitToLast: (count: number) => any;
let fbQuery: (ref: DatabaseReference, ...constraints: any[]) => any;
let fbStartAt: (value: any, key?: string) => any;
let fbTransaction: (r: DatabaseReference, fn: (current: any) => any) => Promise<{ committed: boolean; snapshot: DataSnapshot }>;
let fbOff: (r: DatabaseReference, event?: string) => void;

async function ensureLoaded() {
  if (fbRef) return;
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
  fbTransaction = db.runTransaction;
  fbOff = db.off;
}

export type { DatabaseReference as Ref, DataSnapshot, Unsubscribe };

export function ref(path: string): DatabaseReference {
  if (!browser || !isReady()) {
    // Return a stub reference that silently no-ops (SSR safety)
    return { key: path, parent: null, child: () => null, set: async () => {}, update: async () => {}, push: () => null, remove: async () => {}, onValue: () => () => {}, onChildAdded: () => () => {}, onChildChanged: () => () => {}, onChildRemoved: () => () => {}, get: async () => ({ val: () => null, key: path, exists: () => false, forEach: () => false }) };
  }
  const db = getDatabaseInstance();
  return fbRef(db, path);
}

export async function set(r: DatabaseReference, value: unknown): Promise<void> {
  await ensureLoaded();
  return fbSet(r, value);
}

export async function update(r: DatabaseReference, values: Record<string, unknown>): Promise<void> {
  await ensureLoaded();
  return fbUpdate(r, values);
}

export function push(r: DatabaseReference, value?: unknown): DatabaseReference {
  return fbPush(r, value);
}

export async function remove(r: DatabaseReference): Promise<void> {
  await ensureLoaded();
  return fbRemove(r);
}

export function onValue(r: DatabaseReference, cb: (snap: DataSnapshot) => void): Unsubscribe {
  return fbOnValue(r, cb);
}

export function onChildAdded(r: DatabaseReference, cb: (snap: DataSnapshot, prev: string | null) => void): Unsubscribe {
  return fbOnChildAdded(r, cb);
}

export function onChildChanged(r: DatabaseReference, cb: (snap: DataSnapshot, prev: string | null) => void): Unsubscribe {
  return fbOnChildChanged(r, cb);
}

export function onChildRemoved(r: DatabaseReference, cb: (snap: DataSnapshot) => void): Unsubscribe {
  return fbOnChildRemoved(r, cb);
}

export async function get(r: DatabaseReference): Promise<DataSnapshot> {
  await ensureLoaded();
  return fbGet(r);
}

export function detach(r: DatabaseReference, event?: string): void {
  if (!fbOff) return;
  fbOff(r, event);
}

export { fbQuery as query, fbLimitToLast as limitToLast, fbStartAt as startAt };

export async function transaction(
  r: DatabaseReference,
  updateFn: (current: unknown) => unknown,
): Promise<{ committed: boolean; snapshot: DataSnapshot }> {
  await ensureLoaded();
  return fbTransaction(r, updateFn);
}