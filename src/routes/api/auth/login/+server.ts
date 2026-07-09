import { json } from '@sveltejs/kit';

export async function POST({ request }: { request: Request }) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    const rawUsername = body.username ?? '';
    const password = body.password ?? '';

    if (!rawUsername || !password) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }

    const { sanitizeUsername } = await import('$lib/utils/sanitize');
    const { getAdminDb, getAdminAuth } = await import('$lib/server/firebase-admin');
    const { ref: dbRef, get, update } = await import('firebase-admin/database');

    const username = sanitizeUsername(rawUsername);
    const db = getAdminDb();

    const authSnap = await get(dbRef(db, `user_auth/${username}`));
    if (!authSnap.exists()) {
      await new Promise((r) => setTimeout(r, 100));
      return json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { passwordHash, userId } = authSnap.val() as { passwordHash: string; userId: string };
    const valid = await Bun.password.verify(password, passwordHash);
    if (!valid) {
      return json({ error: 'Authentication failed' }, { status: 401 });
    }

    const now = Date.now();
    await update(dbRef(db, `users/${username}`), { status: 'online', lastSeen: now });

    const auth = getAdminAuth();
    const customToken = await auth.createCustomToken(userId, { username });

    const userSnap = await get(dbRef(db, `users/${username}`));
    const userData = userSnap.val() as { displayName: string } | null;

    return json({ userId, username, displayName: userData?.displayName ?? username, token: customToken });
  } catch (err) {
    console.error('[login]', err);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
}