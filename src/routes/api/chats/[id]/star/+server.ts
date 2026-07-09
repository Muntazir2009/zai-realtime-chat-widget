import { json } from '@sveltejs/kit';

export async function POST({ params, request }: { params: { id: string }; request: Request }) {
  try {
    const { uid, messageId, message } = await request.json() as { uid: string; messageId: string; message: any };
    if (!uid || !messageId) {
      return json({ error: 'Missing fields' }, { status: 400 });
    }

    const { getAdminDb } = await import('$lib/server/firebase-admin');
    const { ref: dbRef, set, get, remove } = await import('firebase-admin/database');
    const db = getAdminDb();
    const starRef = dbRef(db, `starred/${uid}/${params.id}/${messageId}`);

    const snap = await get(starRef);
    if (snap.exists()) {
      await remove(starRef);
      return json({ action: 'unstarred' });
    }

    await set(starRef, {
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