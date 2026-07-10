// ============================================================
// Storage — Firebase Storage uploads (client-side).
// Uploads directly to Firebase Storage from the browser.
// No server proxy needed — Firebase Storage handles CORS natively.
// ============================================================

import { browser } from '$app/environment';
import { ensureReady, isReady } from './config.js';

export interface UploadResult {
  publicUrl: string;
  key: string;
}

let _fbStorage: any = null;
let _fbUploadBytesResumable: any = null;
let _fbGetDownloadURL: any = null;
let _fbRef: any = null;

async function ensureStorageLoaded() {
  if (_fbStorage) return;
  await ensureReady();
  if (!isReady()) throw new Error('Firebase not initialized');

  const mod = await import('firebase/storage');
  _fbStorage = mod.getStorage;
  _fbUploadBytesResumable = mod.uploadBytesResumable;
  _fbGetDownloadURL = mod.getDownloadURL;
  _fbRef = mod.ref;

  const app = (await import('firebase/app')).getApps()[0];
  _fbStorage = mod.getStorage(app);
}

/**
 * Upload a file to Firebase Storage.
 * Returns the public download URL and storage path.
 */
export async function uploadFile(
  file: File | Blob,
  folder: string = 'media',
  filename?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  if (!browser) throw new Error('Uploads only work in the browser');

  await ensureStorageLoaded();

  const name = filename || (file instanceof File ? file.name : `upload-${Date.now()}.bin`);
  const timestamp = Date.now();
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${folder}/${timestamp}-${sanitized}`;

  const storageRef = _fbRef(_fbStorage, storagePath);
  const uploadTask = _fbUploadBytesResumable(storageRef, file);

  return new Promise<UploadResult>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot: any) => {
        if (onProgress && snapshot.bytesTransferred !== undefined && snapshot.totalBytes !== undefined) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (error: any) => {
        console.error('[uploadFile] Firebase Storage error:', error);
        reject(new Error(`Upload failed: ${error.message || 'Unknown error'}`));
      },
      async () => {
        try {
          const downloadUrl = await _fbGetDownloadURL(uploadTask.snapshot.ref);
          resolve({ publicUrl: downloadUrl, key: storagePath });
        } catch (err: any) {
          console.error('[uploadFile] Failed to get download URL:', err);
          reject(new Error(`Upload succeeded but failed to get URL: ${err.message}`));
        }
      },
    );
  });
}