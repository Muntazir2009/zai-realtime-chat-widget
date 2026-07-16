import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generatePresignedUploadUrl } from '$lib/server/r2';
import { getEnv } from '$lib/server/firebase-rest';

/**
 * Fast upload endpoint — receives raw file body (not FormData).
 * Uses presigned URL via native fetch (avoids AWS SDK in hot path).
 * Client sends raw file bytes with metadata in headers.
 */
export const PUT: RequestHandler = async ({ request }) => {
  try {
    const filename = request.headers.get('x-file-name') || `upload-${Date.now()}.bin`;
    const contentType = request.headers.get('x-file-content-type') || 'application/octet-stream';
    const folder = request.headers.get('x-file-folder') || 'media';
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);

    const allowedTypes = /^image\/|video\/|audio\//;
    if (!allowedTypes.test(contentType)) {
      return json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const MAX_SIZE = 100 * 1024 * 1024;
    if (contentLength > MAX_SIZE) {
      return json(
        { error: `File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB, max 100MB)` },
        { status: 413 },
      );
    }

    const env = getEnv();
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Generate presigned URL server-side
    const { uploadUrl, publicUrl, key } = await generatePresignedUploadUrl(
      env, sanitized, contentType, folder,
    );

    // Read body as buffer
    const body = await request.arrayBuffer();

    // Upload to R2 via presigned URL using native fetch
    const r2Res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': String(body.byteLength) },
      body,
    });

    if (!r2Res.ok) {
      const text = await r2Res.text().catch(() => '');
      throw new Error(`R2 upload failed (HTTP ${r2Res.status}): ${text.slice(0, 200)}`);
    }

    return json({ publicUrl, key });
  } catch (err: any) {
    console.error('[upload/stream]', err);
    return json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
};