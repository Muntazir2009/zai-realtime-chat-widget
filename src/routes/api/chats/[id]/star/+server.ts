import { json } from '@sveltejs/kit';
import { getEnv, rtdbGet, rtdbSet, rtdbRemove } from '$lib/server/firebase-rest';

export async function POST({ params, request, platform }: { params: { id: string }; request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    const { uid, messageId, message } = (await request.json()) as { uid: string; messageId: string; message: any };
    if (!uid || !messageId) {
      return json({ error: 'Missing fields' }, { status: 400 });
    }

    const snap = await rtdbGet(env, `starred/${uid}/${params.id}/${messageId}`);
    if (snap !== null) {
      await rtdbRemove(env, `starred/${uid}/${params.id}/${messageId}`);
      return json({ action: 'unstarred' });
    }

    await rtdbSet(env, `starred/${uid}/${params.id}/${messageId}`, {
      messageId,
      starredAt: Date.now(),
      message: { id: message.id, c: message.c, t: message.t, ts: message.ts, sid: message.sid },
    });

    return json({ action: 'starred' });
  } catch (err) {
    console.error('[star-message]', err);
    return json({ error: 'Failed' }, { status: 500 });
  }
}