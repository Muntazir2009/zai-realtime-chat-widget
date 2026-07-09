import { json } from '@sveltejs/kit';
import { getEnv, rtdbGet, rtdbUpdate, createCustomToken } from '$lib/server/firebase-rest';
import { verifyPassword } from '$lib/server/password';

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    const body = (await request.json()) as { username?: string; password?: string };
    const rawUsername = body.username ?? '';
    const password = body.password ?? '';

    if (!rawUsername || !password) {
      return json({ error: 'Authentication failed' }, { status: 400 });
    }

    const { sanitizeUsername } = await import('$lib/utils/sanitize');
    const username = sanitizeUsername(rawUsername);

    const authSnap = await rtdbGet(env, `user_auth/${username}`);
    if (authSnap === null) {
      await new Promise((r) => setTimeout(r, 100));
      return json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { passwordHash, userId } = authSnap as { passwordHash: string; userId: string };
    const valid = await verifyPassword(password, passwordHash);
    if (!valid) {
      return json({ error: 'Authentication failed' }, { status: 401 });
    }

    const now = Date.now();
    await rtdbUpdate(env, `users/${username}`, { status: 'online', lastSeen: now });

    const customToken = await createCustomToken(env, userId, { username });

    const userSnap = await rtdbGet(env, `users/${username}`);
    const userData = userSnap as { displayName: string } | null;

    return json({ userId, username, displayName: userData?.displayName ?? username, token: customToken });
  } catch (err) {
    console.error('[login]', err);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
}