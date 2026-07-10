// ============================================================
// Storage — uploads via server-side R2 proxy.
// Client POSTs the file to /api/upload/file; the server
// uploads to R2 and returns the public URL.
// No CORS issues since it's same-origin.
// ============================================================

import { browser } from '$app/environment';

export interface UploadResult {
  publicUrl: string;
  key: string;
}

/**
 * Upload a file to R2 via server proxy.
 * Returns the public download URL and storage path.
 */
export async function uploadFile(
  file: File | Blob,
  folder: string = 'media',
  filename?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  if (!browser) throw new Error('Uploads only work in the browser');

  const name = filename || (file instanceof File ? file.name : `upload-${Date.now()}.bin`);
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Build FormData for server upload
  const formData = new FormData();
  formData.append('file', file instanceof File ? file : new File([file], sanitized), sanitized);
  formData.append('folder', folder);

  // Use XHR for progress tracking
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/file');

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as UploadResult;
          resolve(data);
        } catch {
          reject(new Error(`Upload succeeded but response was invalid: ${xhr.responseText.slice(0, 200)}`));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(data.error || `Upload failed (HTTP ${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (HTTP ${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error(`Upload network error (readyState=${xhr.readyState})`));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out'));
    };

    xhr.timeout = 120_000; // 2 minutes
    xhr.send(formData);
  });
}