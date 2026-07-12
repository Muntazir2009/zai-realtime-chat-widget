// ============================================================
// CRITICAL: DO NOT DELETE THIS FILE.
// This route is actively used by:
//   - InputBar.svelte (image messages, voice messages)
//   - SettingsView.svelte (avatar uploads)
//   - WallpaperPicker.svelte (custom wallpaper uploads)
//   - MediaUploadManager.svelte.ts (upload progress tracking)
//
// All of these call uploadFile() in src/lib/firebase/storage.ts,
// which POSTs multipart form data to THIS endpoint.
// The server then proxies the upload to Cloudflare R2 storage.
// Without this route, ALL file uploads will fail.
// ============================================================

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '$lib/server/firebase-rest';
import { uploadToR2 } from '$lib/server/r2';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') as string) || 'media';

    if (!file || !(file instanceof File)) {
      return json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return json({ error: 'File too large (max 20 MB)' }, { status: 413 });
    }

    const env = getEnv();
    const arrayBuffer = await file.arrayBuffer();
    const result = await uploadToR2(env, arrayBuffer, file.name, file.type || 'application/octet-stream', folder);
    return json({ publicUrl: result.publicUrl, key: result.key });
  } catch (err) {
    console.error('[upload/file]', err);
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return json({ error: msg }, { status: 500 });
  }
};