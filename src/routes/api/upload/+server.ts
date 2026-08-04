// ============================================================
// Server-side upload proxy — receives file from browser and
// uploads to Cloudflare R2 via AWS SDK v3.
//
// Client sends FormData POST with:
//   - file: the File/Blob
//   - folder: target folder in R2 (e.g. 'images', 'videos', 'voice')
//
// Returns JSON: { success: true, key, publicUrl }
// ============================================================

import { json } from '@sveltejs/kit';
import { getEnv } from '$lib/server/firebase-rest';
import { uploadToR2 } from '$lib/server/r2';
import type { RequestHandler } from './$types';

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;  // 20 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

export const POST: RequestHandler = async ({ request, platform }) => {
  try {
    const env = getEnv(platform);
    console.log('[upload] Received upload request');

    const formData = await request.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') as string) || 'media';

    // Validate file
    if (!file || !(file instanceof File)) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    const contentType = file.type || 'application/octet-stream';
    const isVideo = contentType.startsWith('video/');
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / 1024 / 1024);
      return json({ error: `File too large (max ${maxMB}MB)` }, { status: 413 });
    }

    if (file.size === 0) {
      return json({ error: 'Empty file' }, { status: 400 });
    }

    console.log(`[upload] file=${file.name}, size=${file.size}, type=${contentType}, folder=${folder}`);

    // Read file bytes and upload to R2
    const arrayBuffer = await file.arrayBuffer();
    const result = await uploadToR2(env, arrayBuffer, file.name, contentType, folder);

    console.log(`[upload] Success: key=${result.key}, url=${result.publicUrl}`);

    return json({
      success: true,
      key: result.key,
      url: result.publicUrl,
      publicUrl: result.publicUrl,
    });
  } catch (err) {
    console.error('[upload] Upload failed:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return json({ error: message }, { status: 500 });
  }
};
