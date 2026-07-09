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
    apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
    authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.PUBLIC_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
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