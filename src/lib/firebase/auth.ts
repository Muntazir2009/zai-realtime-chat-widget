// ============================================================
// Firebase Auth — thin wrapper, browser-only.
// Fixed: onAuthStateChanged now awaits dynamic import.
// ============================================================

import { browser } from '$app/environment';
import type { User, Unsubscribe } from 'firebase/auth';
import { getApp, getAuthInstance, isReady } from './config.js';

let _signInWithCustomToken: (auth: any, token: string) => Promise<any>;
let _signOut: (auth: any) => Promise<any>;
let _onAuthStateChanged: (auth: any, cb: (user: any) => void, ...args: any[]) => Unsubscribe;

async function ensureLoaded() {
  if (_signInWithCustomToken) return;
  const auth = await import('firebase/auth');
  _signInWithCustomToken = auth.signInWithCustomToken;
  _signOut = auth.signOut;
  _onAuthStateChanged = auth.onAuthStateChanged;
}

export type { User as FirebaseUser };

export async function signInWithCustomToken(token: string): Promise<User | null> {
  if (!browser) return null;
  await ensureLoaded();
  const auth = getAuthInstance();
  const cred = await _signInWithCustomToken(auth, token);
  return cred.user;
}

export async function signOut(): Promise<void> {
  if (!browser) return;
  await ensureLoaded();
  const auth = getAuthInstance();
  await _signOut(auth);
}

export function currentUser(): User | null {
  if (!browser || !isReady()) return null;
  const auth = getAuthInstance();
  return auth.currentUser;
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
  await ensureLoaded();
  const auth = getAuthInstance();
  return _onAuthStateChanged(auth, cb);
}