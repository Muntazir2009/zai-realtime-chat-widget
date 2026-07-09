import { json } from '@sveltejs/kit';
import { sanitize } from '$lib/server/sanitize';

export async function PATCH({ params, request }: { params: { id: string; messageId: string }; request: Request }) {
  try {
    const { content } = await request.json() as { content?: string };
    if (!content || content.trim().length === 0) {
      return json({ error: 'Content required' }, { status: 400 });
    }
    const sanitized = sanitize(content.trim());

    const { getAdminDb } = await import('$lib/server/firebase-admin');
    const { ref: dbRef, update } = await import('firebase-admin/database');
    const db = getAdminDb();

    await update(dbRef(db, '/'), {
      [`chats/${params.id}/messages/${params.messageId}/c`]: sanitized,
      [`chats/${params.id}/messages/${params.messageId}/edited`]: true,
    });

    return json({ success: true });
  } catch (err) {
    console.error('[edit-message]', err);
    return json({ error: 'Failed to edit message' }, { status: 500 });
  }
}