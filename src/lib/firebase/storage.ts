// ============================================================
// Storage — R2-backed media uploads via presigned URLs.
// The client requests a presigned URL from /api/upload/presign,
// then uploads directly to R2.
// ============================================================

export interface PresignRequest {
  chatId: string;
  filename: string;
  contentType: string;
  folder?: string;
}

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

/**
 * Request a presigned R2 upload URL from the server.
 */
export async function requestPresignedUpload(
  chatId: string,
  file: File,
  folder?: string,
): Promise<PresignResult> {
  const res = await fetch('/api/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId,
      filename: file.name,
      contentType: file.type,
      folder,
    }),
  });

  if (!res.ok) throw new Error('Failed to get upload URL');
  return res.json();
}

/**
 * Upload a file to R2 using a presigned URL.
 * Returns the public URL.
 */
export async function uploadToR2(
  presignedUrl: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Upload a file to R2 using a presigned URL.
 */