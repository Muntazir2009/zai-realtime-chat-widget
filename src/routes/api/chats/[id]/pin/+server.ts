import { json } from '@sveltejs/kit';

export async function POST({ params, request }: { params: { id: string }; request: Request }) {
  try {
    const { messageId, pinnedBy, message } = await request.json() as { messageId: string; pinnedBy: string; message: any };
    if (!messageId || !pinnedBy) {
      return json({ error: 'Missing fields' }, { status: 400 });
    }

    const { getAdminDb } = await import('$lib/server/firebase-admin');
    const { ref: dbRef, set, get, remove } = await import('firebase-admin/database');
    const db = getAdminDb();
    const pinnedRef = dbRef(db, `chats/${params.id}/pinned/${messageId}`);

    // Check if already pinned
    const snap = await get(pinnedRef);
    if (snap.exists()) {
      await remove(pinnedRef);
      return json({ action: 'unpinned' });
    }

    // Check max 3 pins
    const allPinned = dbRef(db, `chats/${params.id}/pinned`);
    const allSnap = await get(allPinned);
    if (allSnap.exists()) {
      const count = Object.keys(allSnap.val()).length;
      if (count >= 3) {
        return json({ error: 'Maximum 3 pinned messages' }, { status: 400 });
      }
    }

    await set(pinnedRef, {
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