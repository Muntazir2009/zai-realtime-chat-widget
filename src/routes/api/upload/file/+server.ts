import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadToR2 } from '$lib/server/r2';
import { getEnv } from '$lib/server/firebase-rest';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const env = getEnv(request);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'media';

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (50MB max)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return json({ error: 'File too large (max 50MB)' }, { status: 413 });
    }

    const contentType = file.type || 'application/octet-stream';
    const result = await uploadToR2(env, file, file.name, contentType, folder);

    return json({ publicUrl: result.publicUrl, key: result.key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    console.error('[upload/file]', msg);
    return json({ error: msg }, { status: 500 });
  }
};