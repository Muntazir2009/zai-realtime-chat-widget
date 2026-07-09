import { json } from '@sveltejs/kit';
import { getEnv, rtdbGet, rtdbUpdate, createCustomToken } from '$lib/server/firebase-rest';
import { verifyPassword } from '$lib/server/password';

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    console.log('[login] start');

    const body = (await request.json()) as { username?: string; password?: string };
    const rawUsername = body.username ?? '';
    const password = body.password ?? '';

    console.log(`[login] username="${rawUsername}", pwdLen=${password.length}`);

    if (!rawUsername || !password) {
      return json({ error: 'Missing username or password' }, { status: 400 });
    }

    const { sanitizeUsername } = await import('$lib/utils/sanitize');
    const username = sanitizeUsername(rawUsername);

    // Step 1: Fetch auth record
    console.log(`[login] step 1: fetching user_auth/${username}`);
    const authSnap = await rtdbGet(env, `user_auth/${username}`);
    if (authSnap === null) {
      console.log(`[login] step 1: user "${username}" not found`);
      return json({ error: 'User not found' }, { status: 401 });
    }
    console.log('[login] step 1: auth record found');

    const { passwordHash, userId } = authSnap as { passwordHash: string; userId: string };
    console.log(`[login] step 2: verifying password (hashFormat=${passwordHash.split('$')[0]}, userId=${userId})`);
    const valid = await verifyPassword(password, passwordHash);
    if (!valid) {
      console.log('[login] step 2: password mismatch');
      return json({ error: 'Invalid password' }, { status: 401 });
    }
    console.log('[login] step 2: password verified');

    // Step 3: Update online status
    const now = Date.now();
    await rtdbUpdate(env, `users/${username}`, { status: 'online', lastSeen: now });
    console.log('[login] step 3: online status updated');

    // Step 4: Generate custom token
    console.log('[login] step 4: generating custom token');
    let customToken: string;
    try {
      customToken = await createCustomToken(env, userId, { username });
      console.log(`[login] step 4: token generated, len=${customToken.length}`);
    } catch (tokenErr) {
      console.error('[login] step 4 FAILED:', tokenErr);
      return json({ error: 'Token generation failed — check server logs' }, { status: 500 });
    }

    const userSnap = await rtdbGet(env, `users/${username}`);
    const userData = userSnap as { displayName: string } | null;

    console.log(`[login] SUCCESS for "${username}" (uid=${userId})`);
    return json({ userId, username, displayName: userData?.displayName ?? username, token: customToken });
  } catch (err) {
    console.error('[login] UNHANDLED:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
