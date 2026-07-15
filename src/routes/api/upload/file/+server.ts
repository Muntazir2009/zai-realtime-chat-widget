import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadToR2 } from '$lib/server/r2';
import { getEnv } from '$lib/server/firebase-rest';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'media';

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Size limit: 100MB
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 100MB)` }, { status: 413 });
    }

    const env = getEnv();
    const result = await uploadToR2(env, file, file.name, file.type, folder);

    return json(result);
  } catch (err: any) {
    console.error('[upload/file]', err);
    return json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
};