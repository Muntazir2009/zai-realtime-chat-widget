// ============================================================
// Storage — R2-backed media uploads via server-side proxy.
// The client sends the file to /api/upload/file, which uploads
// to R2 server-side (no CORS issues).
// ============================================================

export interface UploadResult {
  publicUrl: string;
  key: string;
}

/**
 * Upload a file to R2 through the server-side proxy.
 * This avoids CORS issues with direct browser → R2 uploads.
 * Returns the public URL and R2 object key.
 */
export async function uploadFile(
  file: File | Blob,
  folder: string = 'media',
  filename?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  const name = filename || (file instanceof File ? file.name : `upload-${Date.now()}.bin`);

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file, name);
    formData.append('folder', folder);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.publicUrl && data.key) {
            resolve({ publicUrl: data.publicUrl, key: data.key });
          } else if (data.error) {
            reject(new Error(`Upload server error: ${data.error}`));
          } else {
            reject(new Error(`Upload server returned invalid response: ${xhr.responseText.slice(0, 300)}`));
          }
        } catch {
          reject(new Error(`Upload server returned non-JSON: ${xhr.responseText.slice(0, 300)}`));
        }
      } else {
        let detail = xhr.responseText || '(empty body)';
        try {
          const parsed = JSON.parse(xhr.responseText);
          detail = parsed.error || parsed.message || detail;
        } catch { /* use raw text */ }
        reject(new Error(`Upload failed (HTTP ${xhr.status}): ${detail.slice(0, 500)}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error(`Upload network error (status ${xhr.status}, readyState ${xhr.readyState})`));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error('Upload timed out'));
    });

    xhr.open('POST', '/api/upload/file');
    xhr.timeout = 120_000; // 2 minutes
    xhr.send(formData);
  });
}