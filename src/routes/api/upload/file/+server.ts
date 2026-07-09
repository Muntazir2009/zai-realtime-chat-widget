import { json } from '@sveltejs/kit';
import { getEnv } from '$lib/server/firebase-rest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let _s3: S3Client | null = null;

function getS3Client(env: any): S3Client {
  if (!_s3) {
    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('[R2] Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY');
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
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'media';

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    const client = getS3Client(env);
    const bucket = env.R2_BUCKET_NAME || 'chat';
    const publicBase = env.PUBLIC_R2_PUBLIC_URL || '';
    const key = `${folder}/${Date.now()}-${file.name}`;

    const arrayBuffer = await file.arrayBuffer();

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: file.type,
      Body: new Uint8Array(arrayBuffer),
    }));

    const publicUrl = `${publicBase}/${key}`;

    return json({ publicUrl, key });
  } catch (err) {
    console.error('[upload/file]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
}