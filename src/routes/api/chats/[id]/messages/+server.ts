import { json } from '@sveltejs/kit';
import { getEnv, rtdbGet, rtdbPush, rtdbUpdate } from '$lib/server/firebase-rest';

export async function GET({ params, platform }: { params: { id: string }; platform: any }) {
  try {
    const env = getEnv(platform);
    const all = await rtdbGet(env, `chats/${params.id}/messages`);
    if (all === null) return json({ messages: [] });

    const sorted = Object.values(all as Record<string, any>)
      .sort((a: any, b: any) => (a.ts ?? 0) - (b.ts ?? 0))
      .slice(-50);
    return json({ messages: sorted });
  } catch (err) {
    console.error('[get-messages]', err);
    return json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST({ params, request, platform }: { params: { id: string }; request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    const body = (await request.json()) as { senderId?: string; content?: string; type?: string; replyToId?: string };
    const { senderId, content, type = 'text', replyToId } = body;
    if (!senderId || !content) return json({ error: 'Missing fields' }, { status: 400 });

    const msgId = await rtdbPush(env, `chats/${params.id}/messages`, null as any);
    const now = Date.now();
    const message = { id: msgId, c: content, sid: senderId, t: type, ts: now, rk: msgId, rid: replyToId ?? null, mu: null, mh: null, md: null };

    await rtdbUpdate(env, '/', {
      [`chats/${params.id}/messages/${msgId}`]: message,
      [`chats/${params.id}/meta/ts`]: now,
      [`chats/${params.id}/meta/lm`]: content.slice(0, 100),
      [`chats/${params.id}/meta/updatedAt`]: now,
    });
    return json({ message });
  } catch (err) {
    console.error('[send-message]', err);
    return json({ error: 'Failed' }, { status: 500 });
  }
}