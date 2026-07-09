import { json } from '@sveltejs/kit';
import { getEnv, rtdbGet, rtdbSet, rtdbUpdate, createCustomToken } from '$lib/server/firebase-rest';
import { hashPassword } from '$lib/server/password';

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    const body = (await request.json()) as {
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

    const { sanitizeUsername, isValidUsername } = await import('$lib/utils/sanitize');

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

    // Check existing user
    const existingSnap = await rtdbGet(env, `users/${username}`);
    if (existingSnap !== null) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const userId = `user_${username}`;
    const now = Date.now();

    const userData = { id: userId, username, displayName: trimmedName, avatarUrl: null, status: 'online', lastSeen: now, createdAt: now };
    const authData = { passwordHash, userId };

    await rtdbSet(env, `users/${username}`, userData);
    await rtdbSet(env, `user_auth/${username}`, authData);
    await rtdbSet(env, `user_index/${userId}`, username);

    const customToken = await createCustomToken(env, userId, { username });

    return json({ userId, username, displayName: trimmedName, token: customToken });
  } catch (err) {
    console.error('[register]', err);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
}