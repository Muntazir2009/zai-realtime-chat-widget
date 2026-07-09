// ============================================================
// Firebase Auth — thin wrapper, browser-only.
// Fixed: onAuthStateChanged now awaits dynamic import.
// ============================================================

import { browser } from '$app/environment';
import type { User, Unsubscribe } from 'firebase/auth';
import { getApp, getAuthInstance, isReady, ensureReady } from './config.js';

let _signInWithCustomToken: ((auth: any, token: string) => Promise<any>) | undefined;
let _signOut: ((auth: any) => Promise<any>) | undefined;
let _onAuthStateChanged: ((auth: any, cb: (user: any) => void, ...args: any[]) => Unsubscribe) | undefined;
let _loaded = false;

async function ensureLoaded() {
  if (_loaded) return;
  const auth = await import('firebase/auth');
  _signInWithCustomToken = auth.signInWithCustomToken;
  _signOut = auth.signOut;
  _onAuthStateChanged = auth.onAuthStateChanged;
  _loaded = true;
}

export type { User as FirebaseUser };

export async function signInWithCustomToken(token: string): Promise<User | null> {
  if (!browser) return null;
  await ensureReady();
  await ensureLoaded();
  const auth = getAuthInstance();
  if (!auth) throw new Error('Firebase Auth not initialized');
  const cred = await _signInWithCustomToken!(auth, token);
  return cred.user;
}

export async function signOut(): Promise<void> {
  if (!browser) return;
  await ensureReady();
  await ensureLoaded();
  const auth = getAuthInstance();
  if (!auth) return;
  await _signOut!(auth);
}

export function currentUser(): User | null {
  if (!browser || !isReady()) return null;
  const auth = getAuthInstance();
  return auth?.currentUser ?? null;
}

/**
 * Subscribe to Firebase auth state changes.
 * Now properly awaits the dynamic import before subscribing.
 */
export async function onAuthStateChanged(cb: (user: User | null) => void): Promise<Unsubscribe> {
  if (!browser) {
    cb(null);
    return () => {};
  }
  await ensureReady();
  await ensureLoaded();
  const auth = getAuthInstance();
  if (!auth) throw new Error('Firebase Auth not initialized');
  return _onAuthStateChanged!(auth, cb);
}