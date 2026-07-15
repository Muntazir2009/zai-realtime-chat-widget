// ============================================================
// Storage — Fast uploads to R2.
//
// Upload strategy (tried in order):
//   1. Direct upload to R2 via presigned URL (fastest, requires CORS)
//   2. Raw-body proxy via /api/upload/stream (fast, no FormData overhead)
//   3. FormData proxy via /api/upload/file (slow fallback)
//
// The raw-body proxy skips multipart encoding/decoding, making
// video uploads significantly faster than the old FormData approach.
// R2 CORS is auto-configured on first upload to enable path #1.
// ============================================================

import { browser } from '$app/environment';

export interface UploadResult {
  publicUrl: string;
  key: string;
  blurhash?: string;
}

// ── Blurhash Generation (runs in parallel / before upload) ────

async function generateBlurhash(file: File): Promise<string> {
  try {
    const { default: blurhash } = await import('blurhash');
    const { encode } = blurhash;

    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Failed to load image'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    const size = 64;
    const scale = size / Math.max(img.width, img.height);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return encode(imageData.data, canvas.width, canvas.height, 4, 3);
  } catch {
    return '';
  }
}

// ── Presigned URL Fetch ────────────────────────────────────

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

async function getPresignedUrl(filename: string, contentType: string, folder: string): Promise<PresignResponse> {
  const res = await fetch('/api/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, folder }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `Presign failed (HTTP ${res.status})`);
  }

  return res.json();
}

// ── Method 1: Direct Upload to R2 (presigned URL) ──────────

/**
 * Upload directly to R2 via presigned URL. Single hop — fastest possible.
 * Requires CORS to be configured on the R2 bucket.
 */
async function uploadDirectToR2(
  presignedUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 direct upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('R2 direct upload: CORS or network error'));
    xhr.ontimeout = () => reject(new Error('R2 direct upload timed out'));
    xhr.timeout = 300_000; // 5 minutes
    xhr.send(file);
  });
}

// ── Method 2: Streaming Proxy (zero-buffer) ────────────────

/**
 * Upload via streaming proxy. Client → SvelteKit → R2 piped simultaneously.
 * Raw body (no FormData) so the server can stream bytes to R2 without buffering.
 * This is ~5-10x faster than the old FormData proxy for large files.
 */
async function uploadViaStreamProxy(
  file: Blob,
  filename: string,
  contentType: string,
  folder: string,
  onProgress?: (pct: number) => void,
): Promise<{ publicUrl: string; key: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', '/api/upload/stream');
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-file-name', filename);
    xhr.setRequestHeader('x-file-content-type', contentType);
    xhr.setRequestHeader('x-file-folder', folder);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        // Report 0-95% during upload; remaining 5% is server→R2 time
        onProgress(Math.round((e.loaded / e.total) * 95));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ publicUrl: data.publicUrl, key: data.key });
        } catch {
          reject(new Error('Invalid response from stream proxy'));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.error || `Stream proxy failed (HTTP ${xhr.status})`));
        } catch {
          reject(new Error(`Stream proxy failed (HTTP ${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Stream proxy network error'));
    xhr.ontimeout = () => reject(new Error('Stream proxy timed out'));
    xhr.timeout = 300_000; // 5 minutes

    // Send raw file body — NOT FormData!
    xhr.send(file);
  });
}

// ── Method 3: FormData Proxy (slow fallback) ───────────────

/**
 * Upload via server FormData proxy. Slowest method — used as last resort.
 * Server buffers entire file, then uploads to R2.
 */
async function uploadViaFormDataProxy(
  file: Blob,
  filename: string,
  contentType: string,
  folder: string,
  onProgress?: (pct: number) => void,
): Promise<{ publicUrl: string; key: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file instanceof File ? file : new File([file], filename, { type: contentType }), filename);
    formData.append('folder', folder);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/file');

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 95));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ publicUrl: data.publicUrl, key: data.key });
        } catch {
          reject(new Error('Invalid response from file proxy'));
        }
      } else {
        reject(new Error(`File proxy failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('File proxy network error'));
    xhr.ontimeout = () => reject(new Error('File proxy timed out'));
    xhr.timeout = 300_000;
    xhr.send(formData);
  });
}

// ── Public API ─────────────────────────────────────────────

/**
 * Upload a file to R2 with automatic method selection.
 *
 * Strategy:
 *   1. Direct to R2 (presigned URL) — fastest, needs CORS
 *   2. Streaming proxy — fast, no CORS needed (raw body piped through)
 *   3. FormData proxy — slow fallback (full buffer on server)
 *
 * Progress is reported via onProgress callback.
 * For images, also returns a blurhash string.
 */
export async function uploadFile(
  file: File | Blob,
  folder: string = 'media',
  filename?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  if (!browser) throw new Error('Uploads only work in the browser');

  const name = filename || (file instanceof File ? file.name : `upload-${Date.now()}.bin`);
  const contentType = file instanceof File ? file.type : 'application/octet-stream';
  const isImage = file instanceof File && file.type.startsWith('image/');

  // Step 1: Generate blurhash for images (runs before upload starts)
  let blurhash = '';
  if (isImage) {
    blurhash = await generateBlurhash(file as File);
    onProgress?.(5);
  }

  // Step 2: Get presigned URL (tiny JSON request, instant)
  onProgress?.(isImage ? 8 : 2);
  let presignResult: PresignResponse;
  try {
    presignResult = await getPresignedUrl(name, contentType, folder);
  } catch {
    // Presign failed — skip to streaming proxy
    console.warn('[storage] Presign failed, going straight to streaming proxy');
    onProgress?.(isImage ? 10 : 5);
    const result = await uploadViaStreamProxy(file, name, contentType, folder, onProgress);
    onProgress?.(100);
    const out: UploadResult = { publicUrl: result.publicUrl, key: result.key };
    if (blurhash) out.blurhash = blurhash;
    return out;
  }
  onProgress?.(isImage ? 10 : 5);

  // Step 3: Try direct upload to R2 (fastest, needs CORS)
  try {
    await uploadDirectToR2(
      presignResult.uploadUrl,
      file,
      contentType,
      isImage
        ? (pct) => onProgress?.(10 + Math.round(pct * 0.9))
        : (pct) => onProgress?.(5 + Math.round(pct * 0.95)),
    );
    onProgress?.(100);
    const out: UploadResult = { publicUrl: presignResult.publicUrl, key: presignResult.key };
    if (blurhash) out.blurhash = blurhash;
    return out;
  } catch (directErr) {
    console.warn('[storage] Direct R2 upload failed (likely CORS), trying streaming proxy:', directErr);
  }

  // Step 4: Streaming proxy (fast fallback — raw body piped to R2)
  try {
    const result = await uploadViaStreamProxy(file, name, contentType, folder, onProgress);
    onProgress?.(100);
    const out: UploadResult = { publicUrl: result.publicUrl, key: result.key };
    if (blurhash) out.blurhash = blurhash;
    return out;
  } catch (streamErr) {
    console.warn('[storage] Streaming proxy failed, trying FormData fallback:', streamErr);
  }

  // Step 5: FormData proxy (slowest fallback)
  const result = await uploadViaFormDataProxy(file, name, contentType, folder, onProgress);
  onProgress?.(100);
  const out: UploadResult = { publicUrl: result.publicUrl, key: result.key };
  if (blurhash) out.blurhash = blurhash;
  return out;
}

/**
 * Upload with blurhash — same as uploadFile but always returns blurhash.
 */
export async function uploadImage(
  file: File,
  folder: string = 'images',
  onProgress?: (pct: number) => void,
): Promise<UploadResult & { blurhash: string }> {
  const result = await uploadFile(file, folder, file.name, onProgress);
  return {
    publicUrl: result.publicUrl,
    key: result.key,
    blurhash: result.blurhash || '',
  };
}