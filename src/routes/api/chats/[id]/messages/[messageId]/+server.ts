import { json } from '@sveltejs/kit';

export async function DELETE({ params }: { params: { id: string; messageId: string } }) {
  try {
    const { getAdminDb } = await import('$lib/server/firebase-admin');
    const { ref: dbRef, remove } = await import('firebase-admin/database');
    const db = getAdminDb();
    await remove(dbRef(db, `chats/${params.id}/messages/${params.messageId}`));
    return json({ success: true });
  } catch (err) {
    console.error('[delete-message]', err);
    return json({ error: 'Failed to delete message' }, { status: 500 });
  }
}