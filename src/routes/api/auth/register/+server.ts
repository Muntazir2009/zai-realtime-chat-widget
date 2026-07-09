// ============================================================
// POST /api/auth/register
// Lazy-loads firebase-admin to reduce memory footprint.
// ============================================================

import { json } from '@sveltejs/kit';

export async function POST({ request }: { request: Request }) {
  try {
    const body = await request.json() as {
      username?: string;
      password?: string;
      displayName?: string;
    };

    const rawUsername = body.username ?? '';
    const password = body.password ?? '';
    const displayName = body.displayName ?? '';

    if (!rawUsername || !password || !displayName) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }

    // Lazy-load server deps
    const { sanitizeUsername, isValidUsername } = await import('$lib/utils/sanitize');
    const { getAdminDb, getAdminAuth } = await import('$lib/server/firebase-admin');

    const username = sanitizeUsername(rawUsername);

    if (!isValidUsername(username)) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }

    const RESERVED = new Set(['admin', 'system', 'root', 'null', 'undefined', 'me', 'bot', 'support', 'help']);
    if (RESERVED.has(username)) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }
    if (password.length < 8) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }
    const trimmedName = displayName.trim().slice(0, 50);
    if (!trimmedName) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }

    const { ref: dbRef, set, get } = await import('firebase-admin/database');
    const db = getAdminDb();

    const existingSnap = await get(dbRef(db, `users/${username}`));
    if (existingSnap.exists()) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }

    const passwordHash = await Bun.password.hash(password, {
      algorithm: 'argon2id',
      memoryCost: 65536,
      timeCost: 3,
    });

    const userId = `user_${username}`;
    const now = Date.now();

    const userData = { id: userId, username, displayName: trimmedName, avatarUrl: null, status: 'online' as const, lastSeen: now, createdAt: now };
    const authData = { passwordHash, userId };

    await set(dbRef(db, `users/${username}`), userData);
    await set(dbRef(db, `user_auth/${username}`), authData);

    // Create user_index for fast reverse lookups (uid → username)
    await set(dbRef(db, `user_index/${userId}`), username);

    const auth = getAdminAuth();
    const customToken = await auth.createCustomToken(userId, { username });

    return json({ userId, username, displayName: trimmedName, token: customToken });
  } catch (err) {
    console.error('[register]', err);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
}