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
