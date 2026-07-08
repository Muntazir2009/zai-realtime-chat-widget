// ============================================================
// Cloudflare R2 Server Module
// Generates presigned upload URLs for direct client-to-R2 uploads.
// Stores metadata and final URLs in Firebase RTDB.
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('[R2] Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY');
    }

    _s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return _s3;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

/**
 * Generate a presigned PUT URL for a client-side direct upload to R2.
 */
export async function generatePresignedUploadUrl(
  filename: string,
  contentType: string,
  folder: string = 'media',
): Promise<PresignedUploadResult> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME || 'chat-media';
  const publicBase = process.env.R2_PUBLIC_URL || '';

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

/**
 * Delete an object from R2.
 */
export async function deleteR2Object(key: string): Promise<void> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME || 'chat-media';

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}