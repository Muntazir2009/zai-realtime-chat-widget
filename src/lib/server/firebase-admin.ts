// ============================================================
// Server-side Firebase Admin SDK initialization.
// Used exclusively in +server.ts routes (never imported client-side).
// Reads the service account from env or a JSON file.
// ============================================================

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let _app: App | null = null;
let _db: Database | null = null;
let _auth: Auth | null = null;

function getServiceAccountCredentials() {
  // Priority 1: JSON file path
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  if (filePath) {
    try {
      const resolved = resolve(filePath);
      const json = JSON.parse(readFileSync(resolved, 'utf-8'));
      return cert(json);
    } catch (err) {
      console.error('[FirebaseAdmin] Failed to read service account file:', err);
    }
  }

  // Priority 2: Individual env vars (for CI/CD without file)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  throw new Error(
    '[FirebaseAdmin] No service account configured. ' +
    'Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.'
  );
}

/** Get or create the admin app singleton */
export function getAdminApp(): App {
  if (!_app) {
    if (getApps().length > 0) {
      _app = getApps()[0];
    } else {
      const credential = getServiceAccountCredentials();
      _app = initializeApp({ credential });
    }
  }
  return _app;
}

/** Get the admin RTDB instance */
export function getAdminDb(): Database {
  if (!_db) {
    const app = getAdminApp();
    const dbURL = process.env.PUBLIC_FIREBASE_DATABASE_URL;
    _db = getDatabase(app, dbURL);
  }
  return _db;
}

/** Get the admin Auth instance */
export function getAdminAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getAdminApp());
  }
  return _auth;
}