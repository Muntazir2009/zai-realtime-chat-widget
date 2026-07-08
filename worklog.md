---
Task ID: 1-10 (Final)
Agent: Main
Task: Complete Z.ai Chat — SvelteKit + Firebase RTDB + Cloudflare R2

Work Log:
- Configured real Firebase RTDB credentials via .env (no hardcoded secrets)
- Created Firebase Admin SDK server module for Cloud Function equivalent API routes
- Created Cloudflare R2 server module (presigned URL upload flow)
- All 4 auth/chat/upload API routes use lazy dynamic imports to prevent OOM
- Auth flow: register → Argon2id (Bun native) → RTDB store → Admin custom token → client signInWithCustomToken
- Chat flow: API creates chat in RTDB → client RTDB listeners for messages → fan-out writes
- Media flow: presign request → direct R2 upload → confirm → RTDB metadata
- All client Firebase modules are SSR-safe (browser-only, dynamic imports)
- Disabled SSR via +layout.ts (client-only PWA)
- Fixed Avatar.svelte {src=} Svelte 5 syntax error
- Fixed all Svelte 5 $state reactivity warnings in +page.svelte
- 16 components, 6 managers, 2 web workers, 3 stores, full design token system
- Zero simulation/fallback/mock code — pure Firebase RTDB + R2

Stage Summary:
- Server runs stably (200 OK, no OOM kills after lazy loading)
- All Firebase SDK calls are browser-only with SSR guards
- All server-side modules (firebase-admin, @aws-sdk/client-s3) use dynamic imports
- Auth, chat creation, messaging, media upload all wired end-to-end
- Design tokens: glass morphism, 4px grid, system fonts, safe areas, spring motion
- Mobile-first: 44px touch targets, iOS zoom prevention, env(safe-area-inset-*) support

Unresolved Issues:
- Firebase Admin SDK service account key not yet provided (FIREBASE_SERVICE_ACCOUNT_KEY_PATH in .env)
  → Auth routes will fail until this is configured
- R2 S3 credentials not yet fully configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
  → Media uploads will fail until these are set
- agent-browser cannot connect to localhost:3000 (only reaches port 81 system page)
  → User should verify via Preview Panel
- Minor a11y warnings in MessageBubble and AudioPlayer (non-blocking)
- Voice recording, media gallery features are UI-only (full backend integration pending)
- GestureManager, CacheManager need deeper testing with real RTDB data