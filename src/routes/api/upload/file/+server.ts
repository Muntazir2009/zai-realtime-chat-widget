// ============================================================
// File Upload API — Server-side proxy for R2 uploads.
// Accepts multipart FormData, uploads to Cloudflare R2.
// Eliminates CORS issues with direct browser → R2 presigned URLs.
// ============================================================

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { EnvVars } from '$lib/server/firebase-rest';

function getEnv(): EnvVars {
  return {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || '',
    PUBLIC_FIREBASE_DATABASE_URL: process.env.PUBLIC_FIREBASE_DATABASE_URL || '',
    PUBLIC_FIREBASE_API_KEY: process.env.PUBLIC_FIREBASE_API_KEY || '',
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'chat-media',
    PUBLIC_R2_PUBLIC_URL: process.env.PUBLIC_R2_PUBLIC_URL || '',
  };
}

function getS3Client(): S3Client {
  const env = getEnv();
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('Missing R2 credentials: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

const ALLOWED_FOLDERS = new Set(['images', 'voice', 'media']);

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'media';

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate folder
    if (!ALLOWED_FOLDERS.has(folder)) {
      return json({ error: `Invalid folder: ${folder}` }, { status: 400 });
    }

    // Validate file size (max 50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return json({ error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 50MB)` }, { status: 413 });
    }

    const env = getEnv();
    const bucket = env.R2_BUCKET_NAME || 'chat-media';
    const publicBase = env.PUBLIC_R2_PUBLIC_URL || '';
    const timestamp = Date.now();
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${timestamp}-${sanitized}`;

    // Convert File to Uint8Array for S3 SDK
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const s3 = getS3Client();

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: uint8Array,
      ContentType: file.type || 'application/octet-stream',
    }));

    const publicUrl = `${publicBase}/${key}`;

    return json({ publicUrl, key });
  } catch (err: any) {
    console.error('[/api/upload/file] Upload failed:', err);
    return json(
      { error: err.message || 'Upload failed' },
      { status: 500 },
    );
  }
};