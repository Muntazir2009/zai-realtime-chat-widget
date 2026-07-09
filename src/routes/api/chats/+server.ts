import { json } from '@sveltejs/kit';
import { getEnv, rtdbGet, rtdbSet, rtdbUpdate } from '$lib/server/firebase-rest';

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    const body = (await request.json()) as { userId?: string; otherUserId?: string };
    const { userId, otherUserId } = body;

    if (!userId || !otherUserId) {
      return json({ error: 'Missing userId or otherUserId' }, { status: 400 });
    }

    // Check existing chat
    const inboxSnap = await rtdbGet(env, `user_chats/${userId}`);
    if (inboxSnap !== null && typeof inboxSnap === 'object') {
      for (const uc of Object.values(inboxSnap) as Array<{ chatId: string }>) {
        const chatMeta = await rtdbGet(env, `chats/${uc.chatId}/meta`);
        if (chatMeta !== null) {
          const meta = chatMeta as { type: string; participantIds: string[] };
          if (meta.type === 'direct' && meta.participantIds.includes(userId) && meta.participantIds.includes(otherUserId)) {
            return json({ chatId: uc.chatId });
          }
        }
      }
    }

    // Verify other user
    const otherSnap = await rtdbGet(env, `user_index/${otherUserId}`);
    if (otherSnap === null) {
      const username = otherUserId.replace('user_', '');
      const userSnap = await rtdbGet(env, `users/${username}`);
      if (userSnap === null) {
        return json({ error: 'User not found' }, { status: 404 });
      }
    }

    const chatId = `chat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    await rtdbUpdate(env, '/', {
      [`chats/${chatId}/meta`]: { id: chatId, type: 'direct', participantIds: [userId, otherUserId], lm: null, ts: now, updatedAt: now },
      [`user_chats/${userId}/${chatId}`]: { chatId, uid: userId, lrid: null, uc: 0, jt: now },
      [`user_chats/${otherUserId}/${chatId}`]: { chatId, uid: otherUserId, lrid: null, uc: 0, jt: now },
    });
    return json({ chatId });
  } catch (err) {
    console.error('[create-chat]', err);
    return json({ error: 'Failed to create chat' }, { status: 500 });
  }
}