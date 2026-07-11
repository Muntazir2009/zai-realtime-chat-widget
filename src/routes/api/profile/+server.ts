import { json } from '@sveltejs/kit';
import { getEnv, rtdbUpdate, rtdbGet } from '$lib/server/firebase-rest';

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

interface ProfileUpdateBody {
  username: string;
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
      if (typeof body.bio !== 'string' || body.bio.length > 120) {
        return json({ error: 'bio must be a string of at most 120 characters' }, { status: 400 });
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
      if (typeof body.accentColor !== 'string' || !HEX_COLOR_RE.test(body.accentColor)) {
        return json({ error: 'accentColor must be a valid hex color (e.g. #FF5733 or #F53)' }, { status: 400 });
      }
      updates.accentColor = body.accentColor;
      hasUpdates = true;
    }

    if (body.emojiStatus !== undefined) {
      if (typeof body.emojiStatus !== 'string' || body.emojiStatus.length > 10) {
        return json({ error: 'emojiStatus must be a string of at most 10 characters' }, { status: 400 });
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