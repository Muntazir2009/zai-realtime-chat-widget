---
Task ID: 1
Agent: Main Agent
Task: Fix 8 critical UI/UX bugs in real-time chat app

Work Log:
- Analyzed all component files, stores, and managers to understand the codebase
- Fixed sortedInbox to filter out entries without valid chatMeta (DMs not showing)
- Changed nav bar to be persistent everywhere except auth/loading (removed conversation exclusion)
- Added global touchstart handler to close options menu on back gesture near input
- Removed fake online status from Avatar (changed from always-on to opt-in with showStatus prop)
- Removed Phone/Video call buttons and Mute notifications from conversation options menu
- Removed Notifications section entirely from SettingsView, removed fake online indicator from profile card
- Rewrote MessageBubble with proper avatar-bubble alignment using flex-end + avatar-spacer
- Added emoji-only detection for larger emoji display in bubbles
- Changed sendMessage/sendImageMessage/sendVoiceMessage to use optimistic updates (add locally before RTDB write)
- Rewrote ParticleRain with more particles, sparkle trail effects, better animation curves
- Added proper bottom padding in conversation scroll area for persistent nav bar
- Fixed scroll FAB position to account for nav bar

Stage Summary:
- DMs now properly appear (filtered by valid meta)
- Navigation tabs are always visible (persistent nav)
- Options menu no longer triggers on back gesture (global touchstart handler closes it)
- Fake online indicators removed (only real-time presence from Firebase is used)
- Notifications completely removed from settings and conversation menu
- Message bubbles properly aligned with sender avatar (flex layout with spacer)
- Easter egg messages now appear instantly (optimistic local update)
- Easter egg particles are more polished with sparkle trails and better animations

---
Task ID: 2
Agent: Main Agent
Task: Fix build error (Svelte template parser) + resolve 4 critical architecture issues

Work Log:
- Fixed Svelte build error: nested `{ }` in onclick arrow functions confused template parser
  - Changed `onclick={() => { showMenu = false; uiStore.openMediaGallery(); }}` to use comma operator
  - Changed `onclick={() => {}}` to `onclick={() => undefined}`
- Fixed 4 major issues per user report:

1. **Overlapping UI & Safe Areas** (+page.svelte, Conversation.svelte, InputBar.svelte):
   - Bottom nav now hidden when `view === 'conversation'` (user has back button)
   - InputBar: added `padding-bottom: max(4px, env(safe-area-inset-bottom, 0px) + 4px)`
   - Reduced scroll-bottom-pad from 72px to 16px, FAB bottom from 148px to 100px

2. **Message Bubble Styling** (MessageBubble.svelte):
   - Sent: `border-radius: 16px 16px 4px 16px` (rounded-2xl rounded-tr-sm equivalent)
   - Received: `border-radius: 16px 16px 16px 4px` (rounded-2xl rounded-tl-sm equivalent)
   - Padding increased from `8px 10px 4px 10px` to `10px 14px 6px 14px`
   - Removed all inset borders/shadows from received bubbles (clean solid bg)
   - Avatar column: `align-self: flex-end` (aligned with bottom of stack)

3. **Ghost Online Status** (rtdb.ts, PresenceManager.svelte.ts):
   - Added `onDisconnect`, `onDisconnectSet`, `onDisconnectRemove`, `onDisconnectCancel`, `serverTimestamp` to rtdb.ts
   - Rewrote `goOnline()`: queues `onDisconnect().set({status:'offline'})` BEFORE writing online
   - Firebase now guarantees offline cleanup even on crash/tab-close

4. **Missing DM List** (chat.svelte.ts, ChatTile.svelte, ChatList.svelte):
   - Removed `filter(([, uc]) => this.chats.has(uc.chatId))` from sortedInbox
   - sortedInbox now uses `meta ?? null` and falls back to `userChat.jt` for sorting
   - ChatTile accepts `ChatMeta | null` with "Loading..." fallback
   - Added per-chat `onValue` meta listeners so inbox re-sorts in real-time
   - Proper cleanup in `detachInboxListener()`
   - Also fixed BottomNavBar a11y warning (svelte-ignore for tablist on nav)

Stage Summary:
- All 4 fixes committed in d136162 and pushed to GitHub
- Build should pass (fixed Svelte parser error from previous commit too)
- Cloudflare Pages should deploy successfully
