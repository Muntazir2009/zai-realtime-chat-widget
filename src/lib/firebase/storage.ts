// ============================================================
// Storage — Direct uploads to R2 via presigned URLs.
//
// Flow:
//   1. Client requests a presigned PUT URL from /api/upload/presign
//   2. Client uploads directly to R2 (single hop, full speed)
//   3. Client receives the public URL for use in messages
//
// Images are compressed/resized before upload for speed.
// Videos are uploaded as-is (direct upload is already fast).
// ============================================================

import { browser } from '$app/environment';

export interface UploadResult {
  publicUrl: string;
  key: string;
}

// ── Image Compression ──────────────────────────────────────

const MAX_IMAGE_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Compress and optionally resize an image file.
 * Returns a JPEG blob that's typically 50-80% smaller.
 */
function compressImage(file: File): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Resize if larger than max dimension
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Use 'image/jpeg' for best compression; for PNGs with transparency
      // we still use JPEG (chat images don't need transparency)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, width, height });
          } else {
            // Fallback: return original file
            resolve({ blob: file, width: img.width, height: img.height });
          }
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // On error, return original file uncompressed
      resolve({ blob: file, width: 0, height: 0 });
    };

    img.src = url;
  });
}

// ── Blurhash Generation (runs in parallel during upload) ────

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
    const size = 64; // Small for fast encoding
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

// ── Direct Upload to R2 ────────────────────────────────────

/**
 * Upload a file directly to R2 via presigned URL.
 * Single network hop — no server proxy bottleneck.
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
        reject(new Error(`R2 upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('R2 upload network error'));
    };

    xhr.ontimeout = () => {
      reject(new Error('R2 upload timed out'));
    };

    xhr.timeout = 300_000; // 5 minutes for large videos
    xhr.send(file);
  });
}

// ── Public API ─────────────────────────────────────────────

/**
 * Upload a file to R2.
 * - Images are compressed (50-80% smaller) before upload
 * - All files upload directly to R2 (no server proxy)
 * - Progress is reported via onProgress callback
 * - For images, also returns a blurhash string
 */
export async function uploadFile(
  file: File | Blob,
  folder: string = 'media',
  filename?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  if (!browser) throw new Error('Uploads only work in the browser');

  const name = filename || (file instanceof File ? file.name : `upload-${Date.now()}.bin`);
  const isImage = file instanceof File && file.type.startsWith('image/');

  // Step 1: Compress image (saves 50-80% bandwidth)
  let uploadBlob: Blob = file;
  let blurhash = '';

  if (isImage) {
    // Run compression and blurhash in parallel
    const [compressed, hash] = await Promise.all([
      compressImage(file as File),
      generateBlurhash(file as File),
    ]);
    uploadBlob = compressed.blob;
    blurhash = hash;

    // Report 5% progress for compression step
    onProgress?.(5);
  }

  // Step 2: Get presigned URL (tiny JSON request, instant)
  onProgress?.(isImage ? 8 : 2);
  const presignResult = await getPresignedUrl(
    name,
    uploadBlob.type || (file instanceof File ? file.type : 'application/octet-stream'),
    folder,
  );
  let publicUrl = presignResult.publicUrl;
  let key = presignResult.key;
  onProgress?.(isImage ? 10 : 5);

  // Step 3: Direct upload to R2 (the actual transfer)
  try {
    await uploadDirectToR2(
      presignResult.uploadUrl,
      uploadBlob,
      uploadBlob.type || 'application/octet-stream',
      isImage
        ? (pct) => onProgress?.(10 + Math.round(pct * 0.9)) // 10-100%
        : (pct) => onProgress?.(5 + Math.round(pct * 0.95)), // 5-100%
    );
  } catch (directErr) {
    console.warn('[storage] Direct R2 upload failed, falling back to server proxy:', directErr);
    // Fallback: server proxy upload via /api/upload/file
    const formData = new FormData();
    formData.append('file', uploadBlob instanceof File ? uploadBlob : new File([uploadBlob], name), name);
    formData.append('folder', folder);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload/file');
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Overwrite publicUrl/key from server response
          try {
            const data = JSON.parse(xhr.responseText);
            publicUrl = data.publicUrl;
            key = data.key;
            resolve();
          } catch {
            resolve(); // Key/publicUrl already set from presign
          }
        } else {
          reject(new Error(`Server proxy upload failed (HTTP ${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Server proxy upload network error'));
      xhr.ontimeout = () => reject(new Error('Server proxy upload timed out'));
      xhr.timeout = 300_000;
      xhr.send(formData);
    });
  }

  onProgress?.(100);

  // Attach blurhash to result for images
  const result: UploadResult & { blurhash?: string } = { publicUrl, key };
  if (blurhash) result.blurhash = blurhash;

  return result;
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
    blurhash: (result as any).blurhash || '',
  };
}