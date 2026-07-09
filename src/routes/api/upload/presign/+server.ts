import { json } from '@sveltejs/kit';
import { getEnv } from '$lib/server/firebase-rest';
import { generatePresignedUploadUrl } from '$lib/server/r2';

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);

    const body = (await request.json()) as {
      chatId?: string;
      filename?: string;
      contentType?: string;
      folder?: string;
    };

    const { filename, contentType, folder } = body;

    if (!filename || !contentType) {
      return json({ error: 'Missing filename or contentType' }, { status: 400 });
    }

    const result = await generatePresignedUploadUrl(env, filename, contentType, folder);

    return json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key: result.key,
    });
  } catch (err) {
    console.error('[upload/presign]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
}