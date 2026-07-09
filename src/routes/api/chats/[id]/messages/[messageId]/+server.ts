import { json } from '@sveltejs/kit';
import { getEnv, rtdbRemove } from '$lib/server/firebase-rest';

export async function DELETE({ params, platform }: { params: { id: string; messageId: string }; platform: any }) {
  try {
    const env = getEnv(platform);
    await rtdbRemove(env, `chats/${params.id}/messages/${params.messageId}`);
    return json({ success: true });
  } catch (err) {
    console.error('[delete-message]', err);
    return json({ error: 'Failed to delete message' }, { status: 500 });
  }
}