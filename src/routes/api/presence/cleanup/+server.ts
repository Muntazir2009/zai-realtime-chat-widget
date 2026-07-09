import { json } from '@sveltejs/kit';
import { getEnv, rtdbSet } from '$lib/server/firebase-rest';

/**
 * Fire-and-forget presence cleanup endpoint.
 * Called via fetch(keepalive: true) from beforeunload/pagehide.
 * Sets the user's presence to 'offline' server-side.
 * This is a backup to Firebase's onDisconnect — which can fail
 * if the RTDB WebSocket was already severed.
 */
export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    const body = (await request.json()) as { path?: string; value?: { uid: string; status: string; lastSeen: number; typing: boolean } };

    if (!body.path || !body.value) {
      return json({ ok: true }, { status: 200 });
    }

    await rtdbSet(env, body.path, body.value);
    return json({ ok: true }, { status: 200 });
  } catch {
    // Always return 200 — the client can't do anything with an error anyway
    return json({ ok: true }, { status: 200 });
  }
}