import { json } from '@sveltejs/kit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getEnv } from '$lib/server/firebase-rest';
import type { EnvVars } from '$lib/server/firebase-rest';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

let _s3: S3Client | null = null;

function getS3Client(env: EnvVars): S3Client {
  if (!_s3) {
    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('[upload] Missing R2 credentials');
    }

    _s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _s3;
}

export async function POST({ request, platform }: { request: Request; platform: any }) {
  try {
    const env = getEnv(platform);
    console.log('[upload/file] start');

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'media';

    if (!file) {
      return json({ error: 'Missing file field' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return json(
        { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
    }

    // Sanitize filename
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${Date.now()}-${sanitized}`;
    const bucket = env.R2_BUCKET_NAME || 'chat';
    const publicBase = (env.PUBLIC_R2_PUBLIC_URL || '').replace(/\/$/, '');

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);

    // Upload directly to R2 via S3 PutObjectCommand
    const client = getS3Client(env);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: file.type,
        Body: body,
      }),
    );

    const publicUrl = `${publicBase}/${key}`;
    console.log(`[upload/file] success: ${key} (${(file.size / 1024).toFixed(1)}KB)`);

    return json({ publicUrl, key });
  } catch (err) {
    console.error('[upload/file] UNHANDLED:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }
}