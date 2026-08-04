// ============================================================
// Server-side file upload proxy → R2.
//
// Accepts multipart FormData from the client, buffers the file
// and uploads to Cloudflare R2 via AWS SDK S3 PutObject, and
// returns the public URL.
//
// Eliminates CORS/network issues with direct browser-to-Worker
// uploads by routing through the SvelteKit server.
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

    // Validate file size (20MB images, 100MB videos)
    const maxSize = file.type.startsWith('video/') ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return json({ error: `File too large (max ${Math.round(maxSize / 1024 / 1024)}MB)` }, { status: 413 });
    }

    const env = getEnv();

    // Buffer the file and upload to R2 via S3 PutObject
    const arrayBuffer = await file.arrayBuffer();

    const result = await uploadToR2(
      env,
      arrayBuffer,
      file.name,
      file.type || 'application/octet-stream',
      folder,
    );

    return json({
      success: true,
      key: result.key,
      url: result.publicUrl,
      publicUrl: result.publicUrl,
    });
  } catch (err) {
    console.error('[upload] Server-side upload failed:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return json({ error: message }, { status: 500 });
  }
};
