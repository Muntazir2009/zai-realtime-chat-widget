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

    // Limit to 20 MB
    if (file.size > 20 * 1024 * 1024) {
      return json({ error: 'File too large (max 20 MB)' }, { status: 413 });
    }

    const env = getEnv();
    const arrayBuffer = await file.arrayBuffer();

    const result = await uploadToR2(
      env,
      arrayBuffer,
      file.name,
      file.type || 'application/octet-stream',
      folder,
    );

    return json({ publicUrl: result.publicUrl, key: result.key });
  } catch (err) {
    console.error('[upload/file]', err);
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return json({ error: msg }, { status: 500 });
  }
};