// ============================================================
// Firebase Client Configuration
// Initialises the Firebase client SDK with env vars.
// SSR-safe: only initializes when running in the browser.
// ============================================================

import { browser } from '$app/environment';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Database } from 'firebase/database';
import type { FirebaseStorage } from 'firebase/storage';

// Lazy-initialized singletons (browser only)
let _app: FirebaseApp;
let _auth: Auth;
let _database: Database;
let _storage: FirebaseStorage;

async function initFirebase() {
  if (!browser) return;

  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const { getDatabase } = await import('firebase/database');
  const { getStorage } = await import('firebase/storage');

  const firebaseConfig = {
    apiKey: 'AIzaSyCVFF3L-y4-YOwHD4bMD1jin-o0Bj5IHdU',
    authDomain: 'chat1306-c3c86.firebaseapp.com',
    databaseURL: 'https://chat1306-c3c86-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'chat1306-c3c86',
    storageBucket: 'chat1306-c3c86.firebasestorage.app',
    messagingSenderId: '980298697611',
    appId: '1:980298697611:web:8dd4306cdc39fd7cb93d8e',
  };

  if (getApps().length === 0) {
    _app = initializeApp(firebaseConfig);
  } else {
    _app = getApps()[0];
  }

  _auth = getAuth(_app);
  _database = getDatabase(_app);
  _storage = getStorage(_app);
}

// Initialize immediately in browser
if (browser) initFirebase();

/** Get the app (browser only) */
export function getApp(): FirebaseApp {
  return _app;
}

/** Get the auth instance (browser only) */
export function getAuthInstance(): Auth {
  return _auth;
}

/** Get the database instance (browser only) */
export function getDatabaseInstance(): Database {
  return _database;
}

/** Get the storage instance (browser only) */
export function getStorageInstance(): FirebaseStorage {
  return _storage;
}

/** Check if Firebase is ready (browser and initialized) */
export function isReady(): boolean {
  return browser && !!_app;
}