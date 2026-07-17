import { json } from '@sveltejs/kit';
import { getEnv } from '$lib/server/firebase-rest';
import { generatePresignedUploadUrl, ensureR2Cors } from '$lib/server/r2';

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const body = (await request.json()) as {
      filename?: string;
      contentType?: string;
      folder?: string;
    };

    const filename = body.filename?.trim();
    const contentType = body.contentType?.trim() ?? '';
    const folder = body.folder?.trim() || 'media';

    if (!filename) {
      return json({ error: 'Missing filename' }, { status: 400 });
    }

    if (!contentType || !ALLOWED_PREFIXES.some((p) => contentType.startsWith(p))) {
      return json({ error: 'Invalid content type — only image/*, video/*, audio/* allowed' }, { status: 400 });
    }

    const env = getEnv(platform);
    const result = await generatePresignedUploadUrl(env, filename, contentType, folder);

    // Fire-and-forget: configure CORS on first upload (don't await)
    ensureR2Cors(env).catch(() => {});

    return json(result);
  } catch (err) {
    console.error('[presign]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Presign failed: ${msg}` }, { status: 500 });
  }
}