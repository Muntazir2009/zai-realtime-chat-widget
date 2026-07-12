import { json } from '@sveltejs/kit';
import { getEnv, rtdbUpdate, rtdbGet, rtdbSet, rtdbRemove } from '$lib/server/firebase-rest';

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

interface ProfileUpdateBody {
  username: string;
  newUsername?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  accentColor?: string;
  emojiStatus?: string;
}

export async function PUT({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    console.log('[profile] PUT start');

    const body = (await request.json()) as ProfileUpdateBody;

    if (!body.username) {
      return json({ error: 'Missing username' }, { status: 400 });
    }

    // Handle username change
    if (body.newUsername !== undefined) {
      if (!USERNAME_RE.test(body.newUsername)) {
        return json({ error: 'Username must be 3-20 characters (letters, numbers, underscores)' }, { status: 400 });
      }
      if (body.newUsername === body.username) {
        return json({ error: 'New username is the same as current' }, { status: 400 });
      }
      // Check if new username is taken
      const existing = await rtdbGet(env, `users/${body.newUsername}`);
      if (existing) {
        return json({ error: 'Username already taken' }, { status: 409 });
      }
      // Copy user data to new key
      const currentData = await rtdbGet(env, `users/${body.username}`);
      if (!currentData) {
        return json({ error: 'Current user not found' }, { status: 404 });
      }
      await rtdbSet(env, `users/${body.newUsername}`, { ...currentData, username: body.newUsername });
      await rtdbRemove(env, `users/${body.username}`);
      console.log(`[profile] renamed "${body.username}" → "${body.newUsername}"`);
      const updated = await rtdbGet(env, `users/${body.newUsername}`);
      return json({ success: true, profile: updated, newUsername: body.newUsername });
    }

    // Build a clean update object with only valid fields
    const updates: Record<string, unknown> = {};
    let hasUpdates = false;

    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string' || body.displayName.length > 50) {
        return json({ error: 'displayName must be a string of at most 50 characters' }, { status: 400 });
      }
      updates.displayName = body.displayName;
      hasUpdates = true;
    }

    if (body.bio !== undefined) {
      if (body.bio !== null && (typeof body.bio !== 'string' || body.bio.length > 120)) {
        return json({ error: 'bio must be a string of at most 120 characters or null' }, { status: 400 });
      }
      updates.bio = body.bio;
      hasUpdates = true;
    }

    if (body.avatarUrl !== undefined) {
      if (typeof body.avatarUrl !== 'string') {
        return json({ error: 'avatarUrl must be a string' }, { status: 400 });
      }
      updates.avatarUrl = body.avatarUrl;
      hasUpdates = true;
    }

    if (body.accentColor !== undefined) {
      if (body.accentColor !== null && (typeof body.accentColor !== 'string' || !HEX_COLOR_RE.test(body.accentColor))) {
        return json({ error: 'accentColor must be a valid hex color (e.g. #FF5733 or #F53) or null' }, { status: 400 });
      }
      updates.accentColor = body.accentColor;
      hasUpdates = true;
    }

    if (body.emojiStatus !== undefined) {
      if (body.emojiStatus !== null && (typeof body.emojiStatus !== 'string' || body.emojiStatus.length > 10)) {
        return json({ error: 'emojiStatus must be a string of at most 10 characters or null' }, { status: 400 });
      }
      updates.emojiStatus = body.emojiStatus;
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Patch the user record in RTDB
    await rtdbUpdate(env, `users/${body.username}`, updates);
    console.log(`[profile] updated user "${body.username}":`, Object.keys(updates).join(', '));

    // Fetch the full updated profile to return
    const updated = await rtdbGet(env, `users/${body.username}`);

    return json({ success: true, profile: updated });
  } catch (err) {
    console.error('[profile] UNHANDLED:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}