import { json } from '@sveltejs/kit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getEnv } from '$lib/server/firebase-rest';

// R2 client (reuse across requests)
let _s3: S3Client | null = null;
function getS3(env: ReturnType<typeof getEnv>): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_FOLDERS = ['media', 'images', 'voice', 'stickers'];

export async function POST({ request }: { request: Request }) {
  try {
    const env = getEnv();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'media';

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_FOLDERS.includes(folder)) {
      return json({ error: `Invalid folder: ${folder}` }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 20MB)` }, { status: 400 });
    }

    // Build storage path
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${timestamp}-${sanitizedName}`;

    // Convert File to Uint8Array for S3 SDK
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Determine content type
    const contentType = file.type || 'application/octet-stream';

    // Upload to R2
    const s3 = getS3(env);
    await s3.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: key,
      Body: uint8Array,
      ContentType: contentType,
    }));

    // Build public URL
    const publicUrl = `${env.PUBLIC_R2_PUBLIC_URL}/${key}`;

    return json({ publicUrl, key });
  } catch (err) {
    console.error('[upload/file] Error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }
}