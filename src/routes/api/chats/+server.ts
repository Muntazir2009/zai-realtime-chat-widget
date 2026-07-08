import { json } from '@sveltejs/kit';

export async function POST({ request }: { request: Request }) {
  try {
    const body = await request.json() as { userId?: string; otherUserId?: string };
    const { userId, otherUserId } = body;

    if (!userId || !otherUserId) {
      return json({ error: 'Missing userId or otherUserId' }, { status: 400 });
    }

    const { getAdminDb } = await import('$lib/server/firebase-admin');
    const { ref: dbRef, get, set, update } = await import('firebase-admin/database');
    const db = getAdminDb();
    const now = Date.now();

    // Check existing chat
    const inboxSnap = await get(dbRef(db, `user_chats/${userId}`));
    if (inboxSnap.exists()) {
      for (const [, uc] of Object.entries(inboxSnap.val() as Record<string, { chatId: string }>)) {
        const chatSnap = await get(dbRef(db, `chats/${uc.chatId}/meta`));
        if (chatSnap.exists()) {
          const meta = chatSnap.val() as { type: string; participantIds: string[] };
          if (meta.type === 'direct' && meta.participantIds.includes(userId) && meta.participantIds.includes(otherUserId)) {
            return json({ chatId: uc.chatId });
          }
        }
      }
    }

    // Verify other user
    const otherSnap = await get(dbRef(db, `user_index/${otherUserId}`));
    if (!otherSnap.exists()) {
      const username = otherUserId.replace('user_', '');
      const userSnap = await get(dbRef(db, `users/${username}`));
      if (!userSnap.exists()) {
        return json({ error: 'User not found' }, { status: 404 });
      }
    }

    const chatId = `chat_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const updates: Record<string, unknown> = {
      [`chats/${chatId}/meta`]: { id: chatId, type: 'direct', participantIds: [userId, otherUserId], lm: null, ts: now, updatedAt: now },
      [`user_chats/${userId}/${chatId}`]: { chatId, uid: userId, lrid: null, uc: 0, jt: now },
      [`user_chats/${otherUserId}/${chatId}`]: { chatId, uid: otherUserId, lrid: null, uc: 0, jt: now },
    };
    await update(dbRef(db, '/'), updates);
    return json({ chatId });
  } catch (err) {
    console.error('[create-chat]', err);
    return json({ error: 'Failed to create chat' }, { status: 500 });
  }
}