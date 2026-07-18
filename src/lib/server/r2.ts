// ============================================================
// Cloudflare R2 Storage — presigned URLs, direct uploads, CORS.
// Uses AWS SDK v3 (compatible with Workers runtime).
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { EnvVars } from './firebase-rest';

export interface PresignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

let _s3: S3Client | null = null;

export function getS3Client(env: EnvVars): S3Client {
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

export interface DirectUploadResult {
  publicUrl: string;
  key: string;
}

/**
 * Upload file bytes directly to R2 (server-side proxy upload).
 */
export async function uploadToR2(
  env: EnvVars,
  body: ArrayBuffer | Uint8Array | Blob,
  filename: string,
  contentType: string,
  folder: string = 'media',
): Promise<DirectUploadResult> {
  const client = getS3Client(env);
  const bucket = env.R2_BUCKET_NAME || 'chat-media';
  const publicBase = env.PUBLIC_R2_PUBLIC_URL || '';

  const key = `${folder}/${Date.now()}-${filename}`;

  // Ensure body is Uint8Array (AWS SDK doesn't accept ArrayBuffer directly)
  const bytes = body instanceof ArrayBuffer
    ? new Uint8Array(body)
    : body instanceof Uint8Array
      ? body
      : new Uint8Array(await (body as Blob).arrayBuffer());

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Body: bytes,
  });

  await client.send(command);
  const publicUrl = `${publicBase}/${key}`;

  return { publicUrl, key };
}

/**
 * Stream upload to R2 — pipes the request body directly without buffering.
 * Eliminates the server-side memory bottleneck for large files.
 */
export async function uploadToR2Stream(
  env: EnvVars,
  body: ReadableStream<Uint8Array>,
  filename: string,
  contentType: string,
  folder: string = 'media',
): Promise<DirectUploadResult> {
  const client = getS3Client(env);
  const bucket = env.R2_BUCKET_NAME || 'chat-media';
  const publicBase = env.PUBLIC_R2_PUBLIC_URL || '';
  const key = `${folder}/${Date.now()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Body: body as any, // AWS SDK v3 accepts Web ReadableStream in Node.js runtime
  });

  await client.send(command);
  const publicUrl = `${publicBase}/${key}`;

  return { publicUrl, key };
}

/**
 * Generate a presigned PUT URL for a client-side direct upload to R2.
 */
export async function generatePresignedUploadUrl(
  env: EnvVars,
  filename: string,
  contentType: string,
  folder: string = 'media',
): Promise<PresignedUploadResult> {
  const client = getS3Client(env);
  const bucket = env.R2_BUCKET_NAME || 'chat-media';
  const publicBase = env.PUBLIC_R2_PUBLIC_URL || '';

  const key = `${folder}/${Date.now()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 }); // 10 min
  const publicUrl = `${publicBase}/${key}`;

  return { uploadUrl, publicUrl, key };
}

// ── CORS Configuration ─────────────────────────────────────

let corsConfigured = false;

/**
 * Configure CORS on the R2 bucket to allow direct browser uploads.
 * Safe: presigned URLs already contain auth credentials, so allowing
 * all origins just lets the browser make the PUT request.
 * Called once on first upload; subsequent calls are no-ops.
 */
export async function ensureR2Cors(env: EnvVars): Promise<void> {
  if (corsConfigured) return;
  const client = getS3Client(env);
  const bucket = env.R2_BUCKET_NAME || 'chat-media';

  try {
    await client.send(new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    }));
    corsConfigured = true;
    console.log('[R2] CORS configured successfully');
  } catch (err) {
    console.warn('[R2] Failed to configure CORS (non-critical):', err);
    // Don't throw — uploads will fall back to streaming proxy
  }
}