import { json } from '@sveltejs/kit';

export async function GET({ params }: { params: { id: string } }) {
  try {
    const { getAdminDb } = await import('$lib/server/firebase-admin');
    const { ref: dbRef, get } = await import('firebase-admin/database');
    const db = getAdminDb();
    const snap = await get(dbRef(db, `chats/${params.id}/messages`));
    if (!snap.exists()) return json({ messages: [] });
    const all = snap.val() as Record<string, any>;
    const sorted = Object.values(all).sort((a: any, b: any) => (a.ts ?? 0) - (b.ts ?? 0)).slice(-50);
    return json({ messages: sorted });
  } catch (err) {
    console.error('[get-messages]', err);
    return json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST({ params, request }: { params: { id: string }; request: Request }) {
  try {
    const body = await request.json() as { senderId?: string; content?: string; type?: string; replyToId?: string };
    const { senderId, content, type = 'text', replyToId } = body;
    if (!senderId || !content) return json({ error: 'Missing fields' }, { status: 400 });

    const { getAdminDb } = await import('$lib/server/firebase-admin');
    const { ref: dbRef, push, get, update } = await import('firebase-admin/database');
    const db = getAdminDb();
    const msgRef = push(dbRef(db, `chats/${params.id}/messages`));
    const msgId = msgRef.key!;
    const now = Date.now();
    const message = { id: msgId, c: content, sid: senderId, t: type, ts: now, rk: msgId, rid: replyToId ?? null, mu: null, mh: null, md: null };
    await update(dbRef(db, '/'), {
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