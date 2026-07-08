// ============================================================
// Firebase Auth — thin wrapper, browser-only.
// ============================================================

import { browser } from '$app/environment';
import type { Auth, User, Unsubscribe } from 'firebase/auth';
import { getApp, getAuthInstance, isReady } from './config.js';

let _signInWithCustomToken: (token: string) => Promise<any>;
let _signOut: () => Promise<any>;
let _onAuthStateChanged: (cb: (user: any) => void) => Unsubscribe;

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

export function onAuthStateChanged(cb: (user: User | null) => void): Unsubscribe {
  if (!browser) {
    cb(null);
    return () => {};
  }
  // Synchronous dynamic import since the module is already loaded on client
  const auth = getAuthInstance();
  return _onAuthStateChanged?.(cb) ?? (() => {});
}