import { json } from '@sveltejs/kit';
import { getEnv, rtdbGet, rtdbSet, rtdbRemove } from '$lib/server/firebase-rest';

export async function POST({ params, request, platform }: { params: { id: string }; request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    const { messageId, pinnedBy, message } = (await request.json()) as { messageId: string; pinnedBy: string; message: any };
    if (!messageId || !pinnedBy) {
      return json({ error: 'Missing fields' }, { status: 400 });
    }

    // Check if already pinned
    const snap = await rtdbGet(env, `chats/${params.id}/pinned/${messageId}`);
    if (snap !== null) {
      await rtdbRemove(env, `chats/${params.id}/pinned/${messageId}`);
      return json({ action: 'unpinned' });
    }

    // Check max 3 pins
    const allSnap = await rtdbGet(env, `chats/${params.id}/pinned`);
    if (allSnap !== null && typeof allSnap === 'object') {
      const count = Object.keys(allSnap).length;
      if (count >= 3) {
        return json({ error: 'Maximum 3 pinned messages' }, { status: 400 });
      }
    }

    await rtdbSet(env, `chats/${params.id}/pinned/${messageId}`, {
      messageId,
      pinnedBy,
      pinnedAt: Date.now(),
      message: { id: message.id, c: message.c, t: message.t, ts: message.ts, sid: message.sid, mu: message.mu },
    });

    return json({ action: 'pinned' });
  } catch (err) {
    console.error('[pin-message]', err);
    return json({ error: 'Failed' }, { status: 500 });
  }
}