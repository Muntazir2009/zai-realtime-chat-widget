import { json } from '@sveltejs/kit';
import { getEnv } from '$lib/server/firebase-rest';
import { uploadToR2 } from '$lib/server/r2';

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;  // 20 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_OTHER_SIZE = 20 * 1024 * 1024;  // 20 MB

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') as string) || 'media';

    if (!file || !(file instanceof File)) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    const contentType = file.type || 'application/octet-stream';
    const isVideo = contentType.startsWith('video/');
    const isImage = contentType.startsWith('image/');
    const maxSize = isVideo ? MAX_VIDEO_SIZE : isImage ? MAX_IMAGE_SIZE : MAX_OTHER_SIZE;

    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / 1024 / 1024);
      return json({ error: `File too large (max ${maxMB}MB)` }, { status: 413 });
    }

    if (file.size === 0) {
      return json({ error: 'Empty file' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await uploadToR2(env, arrayBuffer, file.name, contentType, folder);

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
