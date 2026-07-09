# Task 22-b: Fix typing/presence/realtime logic bugs

## Files Modified
1. `src/lib/managers/PresenceManager.svelte.ts`
2. `src/lib/stores/chat.svelte.ts`
3. `worklog.md`

## Changes

### PresenceManager.svelte.ts
- Added `visibilityHandler` field and `visibilitychange` event listener in constructor — stops all typing when page becomes hidden
- Added public `stopAllTyping()` method that clears all typing timers and immediately removes all RTDB typing nodes
- `stopTyping()` now immediately removes the RTDB typing node via `rtdb.remove()` (fire-and-forget) in addition to calling `writeTyping(false)` for the 3s safety net
- `disconnect()` now calls `stopAllTyping()` and cleans up the visibility listener

### chat.svelte.ts
- **Typing detection fix**: `attachTypingListener` now properly parses RTDB value as `{ typing: boolean; ts: number }` object instead of casting to `boolean` (which was always truthy for an object)
- **Typing safety timeout**: Added `typingSafetyTimeouts` map and `clearTypingSafetyTimeout()` helper. Each typing indicator now has a 5-second auto-expiry in case RTDB removal is delayed or lost
- **Message deletion realtime**: Added `messageRemovedUnsub` field and `onChildRemoved` listener in `openChat()` that filters deleted messages from the local array
- **Cleanup**: `closeChat()` now unsubscribes the `messageRemovedUnsub` listener; `detachTypingListener()` clears all safety timeouts
- **editMessage fix**: Added missing `await` on `rtdb.ref('/')` call (was calling `rtdb.update` with a Promise instead of a DatabaseReference)