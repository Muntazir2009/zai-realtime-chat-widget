import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generatePresignedUploadUrl } from '$lib/server/r2';
import { getEnv } from '$lib/server/firebase-rest';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { filename, contentType, folder } = body as {
      filename: string;
      contentType: string;
      folder?: string;
    };

    if (!filename || !contentType) {
      return json({ error: 'Missing filename or contentType' }, { status: 400 });
    }

    // Validate content type
    const allowedTypes = /^image\/|video\/|audio\//;
    if (!allowedTypes.test(contentType)) {
      return json({ error: 'Unsupported file type' }, { status: 400 });
    }

    // Sanitize filename
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    const env = getEnv();
    const result = await generatePresignedUploadUrl(env, sanitized, contentType, folder || 'media');

    return json(result);
  } catch (err: any) {
    console.error('[presign]', err);
    return json({ error: err.message || 'Failed to generate presigned URL' }, { status: 500 });
  }
};