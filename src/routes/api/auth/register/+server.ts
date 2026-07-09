import { json } from '@sveltejs/kit';
import { getEnv, rtdbGet, rtdbSet, createCustomToken } from '$lib/server/firebase-rest';
import { hashPassword } from '$lib/server/password';

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    console.log('[register] start');

    const body = (await request.json()) as {
      username?: string;
      password?: string;
      displayName?: string;
    };

    const rawUsername = body.username ?? '';
    const password = body.password ?? '';
    const displayName = body.displayName ?? '';

    console.log(`[register] input: username="${rawUsername}", pwdLen=${password.length}, displayName="${displayName}"`);

    if (!rawUsername || !password || !displayName) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { sanitizeUsername, isValidUsername } = await import('$lib/utils/sanitize');

    const username = sanitizeUsername(rawUsername);
    console.log(`[register] sanitized username="${username}"`);

    if (!isValidUsername(username)) {
      return json({ error: 'Invalid username format' }, { status: 400 });
    }

    const RESERVED = new Set(['admin', 'system', 'root', 'null', 'undefined', 'me', 'bot', 'support', 'help']);
    if (RESERVED.has(username)) {
      return json({ error: 'Username is reserved' }, { status: 400 });
    }
    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    const trimmedName = displayName.trim().slice(0, 50);
    if (!trimmedName) {
      return json({ error: 'Display name is required' }, { status: 400 });
    }

    // Step 1: Check existing user
    console.log(`[register] step 1: checking existing user "${username}"`);
    const existingSnap = await rtdbGet(env, `users/${username}`);
    if (existingSnap !== null) {
      console.log(`[register] step 1: user "${username}" already exists`);
      return json({ error: 'Username already taken' }, { status: 409 });
    }
    console.log('[register] step 1: user does not exist, proceeding');

    // Step 2: Hash password
    console.log('[register] step 2: hashing password (PBKDF2-SHA256 600k iterations)');
    const passwordHash = await hashPassword(password);
    console.log(`[register] step 2: password hashed, hashLen=${passwordHash.length}, format=${passwordHash.split('$')[0]}`);

    const userId = `user_${username}`;
    const now = Date.now();

    // Step 3: Write to RTDB
    const userData = { id: userId, username, displayName: trimmedName, avatarUrl: null, status: 'offline', lastSeen: now, createdAt: now };
    const authData = { passwordHash, userId };

    console.log(`[register] step 3: writing user to RTDB (userId=${userId})`);
    await rtdbSet(env, `users/${username}`, userData);
    console.log('[register] step 3a: users/ written');

    await rtdbSet(env, `user_auth/${username}`, authData);
    console.log('[register] step 3b: user_auth/ written');

    await rtdbSet(env, `user_index/${userId}`, username);
    console.log('[register] step 3c: user_index/ written');

    // Step 4: Generate custom token
    console.log('[register] step 4: generating Firebase custom token');
    let customToken: string;
    try {
      customToken = await createCustomToken(env, userId, { username });
      console.log(`[register] step 4: custom token generated, len=${customToken.length}`);
    } catch (tokenErr) {
      console.error('[register] step 4 FAILED: custom token generation failed', tokenErr);
      return json({ error: 'Token generation failed — check server logs' }, { status: 500 });
    }

    console.log(`[register] SUCCESS for user "${username}" (uid=${userId})`);
    return json({ userId, username, displayName: trimmedName, token: customToken });
  } catch (err) {
    console.error('[register] UNHANDLED:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}