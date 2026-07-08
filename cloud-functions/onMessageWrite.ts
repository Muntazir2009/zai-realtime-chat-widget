/**
 * Firebase Cloud Function: onMessageWrite
 *
 * Deploy with:
 *   firebase deploy --only functions:onMessageWrite
 *
 * This function triggers on every write to chats/{chatId}/messages/{messageId}
 * and performs post-write cleanup tasks such as removing stale typing indicators.
 *
 * Requires firebase-functions v4+ and firebase-admin v12+.
 */

import {
  onWrite,
  Change,
  DatabaseSnapshot,
} from 'firebase-functions/v2/database';
import * as admin from 'firebase-admin/admin';

// Initialize Admin SDK (auto-initialized in Cloud Functions environment)
if (!admin.apps.length) {
  admin.initializeApp();
}

const TYPING_TIMEOUT_MS = 3000;

/**
 * Removes typing indicators older than TYPING_TIMEOUT_MS for a given chat.
 * Called after every message write to clean up stale typing state.
 */
async function cleanStaleTypingIndicators(chatId: string): Promise<void> {
  const cutoff = Date.now() - TYPING_TIMEOUT_MS;
  const typingRef = admin.database().ref(`typing/${chatId}`);

  const snapshot = await typingRef.once('value');
  if (!snapshot.exists()) return;

  const updates: Record<string, null> = {};
  snapshot.forEach((child: DatabaseSnapshot) => {
    const timestamp = child.val() as number;
    if (timestamp < cutoff) {
      updates[`${child.key}`] = null;
    }
    return false; // continue iteration
  });

  if (Object.keys(updates).length > 0) {
    await typingRef.update(updates);
    console.log(`[onMessageWrite] Cleaned ${Object.keys(updates).length} stale typing indicators for chat ${chatId}`);
  }
}

/**
 * Triggered on any write (create, update, delete) to a message node.
 * Post-write side effects:
 * 1. Clean stale typing indicators for the chat
 * 2. (Extensible) Could add: push notifications, message indexing, etc.
 */
export const onMessageWrite = onWrite(
  {
    ref: '/chats/{chatId}/messages/{messageId}',
    region: 'europe-west1',
  },
  async (event: { data: Change<DatabaseSnapshot> }) => {
    const { chatId } = event.data.params;

    // Only proceed on create (new message sent) or update
    // Skip deletes — no need to clean typing when a message is removed
    if (!event.data.after.exists()) {
      return null;
    }

    try {
      await cleanStaleTypingIndicators(chatId);
    } catch (error) {
      console.error(`[onMessageWrite] Error cleaning typing indicators for chat ${chatId}:`, error);
    }

    return null;
  }
);