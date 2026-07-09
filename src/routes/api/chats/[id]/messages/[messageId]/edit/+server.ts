import { json } from '@sveltejs/kit';
import { sanitize } from '$lib/server/sanitize';
import { getEnv, rtdbUpdate } from '$lib/server/firebase-rest';

export async function PATCH({ params, request, platform }: { params: { id: string; messageId: string }; request: Request; platform: any }) {
  try {
    const { content } = (await request.json()) as { content?: string };
    if (!content || content.trim().length === 0) {
      return json({ error: 'Content required' }, { status: 400 });
    }
    const sanitized = sanitize(content.trim());
    const env = getEnv(platform);

    await rtdbUpdate(env, '/', {
      [`chats/${params.id}/messages/${params.messageId}/c`]: sanitized,
      [`chats/${params.id}/messages/${params.messageId}/edited`]: true,
    });

    return json({ success: true });
  } catch (err) {
    console.error('[edit-message]', err);
    return json({ error: 'Failed to edit message' }, { status: 500 });
  }
}