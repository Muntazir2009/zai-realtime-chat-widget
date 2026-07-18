import { json } from '@sveltejs/kit';
import { getEnv } from '$lib/server/firebase-rest';
import { uploadToR2Stream } from '$lib/server/r2';

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];
const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

export async function PUT({ request, platform }: { request: Request; platform: any }) {
  try {
    const filename = request.headers.get('x-file-name')?.trim();
    const contentType = request.headers.get('x-file-content-type')?.trim() ?? '';
    const folder = request.headers.get('x-file-folder')?.trim() || 'media';

    if (!filename) {
      return json({ error: 'Missing x-file-name header' }, { status: 400 });
    }

    if (!contentType || !ALLOWED_PREFIXES.some((p) => contentType.startsWith(p))) {
      return json({ error: 'Invalid content type — only image/*, video/*, audio/* allowed' }, { status: 400 });
    }

    // Validate size via Content-Length header (if available)
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > MAX_SIZE) {
        return json({ error: 'File too large — maximum 100 MB' }, { status: 413 });
      }
    }

    // Stream directly to R2 without buffering entire file in memory
    const body = request.body;
    if (!body) {
      return json({ error: 'Empty request body' }, { status: 400 });
    }

    const env = getEnv(platform);
    const result = await uploadToR2Stream(env, body, filename, contentType, folder);

    return json(result);
  } catch (err) {
    console.error('[upload/stream]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }
}