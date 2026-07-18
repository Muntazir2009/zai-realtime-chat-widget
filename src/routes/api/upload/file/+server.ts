import { json } from '@sveltejs/kit';
import { getEnv } from '$lib/server/firebase-rest';
import { uploadToR2 } from '$lib/server/r2';

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];
const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string | null)?.trim() || 'media';

    if (!file) {
      return json({ error: 'Missing file field' }, { status: 400 });
    }

    const contentType = file.type;
    if (!contentType || !ALLOWED_PREFIXES.some((p) => contentType.startsWith(p))) {
      return json({ error: 'Invalid content type — only image/*, video/*, audio/* allowed' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return json({ error: 'File too large — maximum 100 MB' }, { status: 413 });
    }

    if (file.size === 0) {
      return json({ error: 'Empty file' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const env = getEnv(platform);
    const result = await uploadToR2(env, buffer, file.name, contentType, folder);

    return json(result);
  } catch (err) {
    console.error('[upload/file]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }
}