// ============================================================
// MediaUploadManager — Svelte 5 runes class
// Handles file uploads to Cloudflare R2 via presigned URLs,
// encodes images to WebP via a Web Worker, and generates
// blurhash placeholders.
// ============================================================

import type { UploadTask } from '$lib/types/index.js';
import { requestPresignedUpload, uploadToR2, confirmUpload } from '$lib/firebase/storage.js';
import { generateIdempotencyKey } from '$lib/utils/idempotency.js';

// Worker imports — Vite resolves these at build time
import ImageEncoderWorker from '$lib/workers/image-encoder.worker.ts?worker';
import BlurhashWorker from '$lib/workers/blurhash.worker.ts?worker';

type UploadResolve = (task: UploadTask) => void;
type UploadReject = (err: Error) => void;

interface TrackedUpload {
  task: UploadTask;
  resolve: UploadResolve;
  reject: UploadReject;
  abortController?: AbortController;
}

class MediaUploadManager {
  uploads: UploadTask[] = $state([]);
  private tracked: Map<string, TrackedUpload> = new Map();
  private imageEncoder: Worker;
  private blurhashWorker: Worker;

  constructor() {
    this.imageEncoder = new ImageEncoderWorker();
    this.blurhashWorker = new BlurhashWorker();
  }

  /**
   * Upload a file to a chat.
   * For images: encodes to WebP via worker, generates blurhash via worker.
   * Returns the completed UploadTask with url and blurhash.
   */
  async upload(chatId: string, file: File): Promise<UploadTask> {
    const id = generateIdempotencyKey();

    const task: UploadTask = {
      id,
      file,
      chatId,
      progress: 0,
      status: 'pending',
      url: null,
      blurhash: null,
    };

    this.uploads = [...this.uploads, task];

    return new Promise<UploadTask>((resolve, reject) => {
      this.tracked.set(id, { task, resolve, reject });
      this.processUpload(id).catch(reject);
    });
  }

  /** Retry a failed upload */
  retry(taskId: string): void {
    const tracked = this.tracked.get(taskId);
    if (!tracked) return;

    const { task, resolve, reject } = tracked;
    task.status = 'pending';
    task.progress = 0;
    task.url = null;
    task.blurhash = null;
    this.refreshUploads();

    this.processUpload(taskId).then(resolve).catch(reject);
  }

  /** Cancel an in-progress upload */
  cancel(taskId: string): void {
    const tracked = this.tracked.get(taskId);
    if (!tracked) return;

    tracked.abortController?.abort();
    tracked.task.status = 'error';
    tracked.reject(new Error('Upload cancelled'));
    this.tracked.delete(taskId);
    this.refreshUploads();
  }

  /** Remove completed/error tasks from the list */
  cleanup(): void {
    this.uploads = this.uploads.filter((t) => t.status === 'pending' || t.status === 'uploading');
  }

  /** Destroy workers */
  destroy(): void {
    this.imageEncoder.terminate();
    this.blurhashWorker.terminate();
  }

  // ---- Private ----

  private async processUpload(taskId: string): Promise<UploadTask> {
    const tracked = this.tracked.get(taskId);
    if (!tracked) throw new Error('Upload task not found');

    const { task } = tracked;
    task.status = 'uploading';
    this.refreshUploads();

    try {
      let fileToUpload: File | Blob = task.file;

      // If it's an image, encode to WebP via worker
      if (task.file.type.startsWith('image/')) {
        fileToUpload = await this.encodeToWebP(task.file);
      }

      // Get presigned URL from server
      const presignResult = await requestPresignedUpload(
        task.chatId,
        fileToUpload as File,
      );

      // Upload directly to R2
      await uploadToR2(
        presignResult.uploadUrl,
        fileToUpload as File,
        (pct) => {
          task.progress = pct;
          this.refreshUploads();
        },
      );

      task.url = presignResult.publicUrl;
      task.progress = 100;

      // Generate blurhash for images
      if (task.file.type.startsWith('image/')) {
        try {
          const hash = await this.generateBlurhash(task.file);
          task.blurhash = hash;
        } catch {
          // Non-critical — blurhash generation can fail
          console.warn('[MediaUploadManager] Blurhash generation failed');
        }
      }

      task.status = 'done';
      this.refreshUploads();
      tracked.resolve(task);
      this.tracked.delete(taskId);

      return task;
    } catch (err) {
      task.status = 'error';
      this.refreshUploads();
      tracked.reject(err instanceof Error ? err : new Error(String(err)));
      this.tracked.delete(taskId);
      throw err;
    }
  }

  private encodeToWebP(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Image encoding timed out')), 30_000);

      this.imageEncoder.onmessage = (e: MessageEvent) => {
        clearTimeout(timeout);
        resolve(e.data.blob as Blob);
      };
      this.imageEncoder.onerror = (e: ErrorEvent) => {
        clearTimeout(timeout);
        reject(new Error(e.message || 'Image encoding failed'));
      };
      this.imageEncoder.postMessage({ file }, [file]);
    });
  }

  private generateBlurhash(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Fallback gradient placeholder
        resolve('LKO2:N%2Tw=w]~RBVZRi};RPxuwH');
      }, 10_000);

      // Read file as ImageBitmap, then extract ImageData
      createImageBitmap(file).then((bitmap) => {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeout);
          resolve('LKO2:N%2Tw=w]~RBVZRi};RPxuwH');
          return;
        }
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        bitmap.close();

        this.blurhashWorker.onmessage = (e: MessageEvent) => {
          clearTimeout(timeout);
          resolve(e.data.hash as string);
        };
        this.blurhashWorker.onerror = () => {
          clearTimeout(timeout);
          resolve('LKO2:N%2Tw=w]~RBVZRi};RPxuwH');
        };
        this.blurhashWorker.postMessage({
          imageData,
          width: bitmap.width,
          height: bitmap.height,
        }, [imageData.data.buffer]);
      }).catch(() => {
        clearTimeout(timeout);
        resolve('LKO2:N%2Tw=w]~RBVZRi};RPxuwH');
      });
    });
  }

  private refreshUploads(): void {
    // Trigger Svelte reactivity by reassigning
    this.uploads = [...this.uploads];
  }
}

/** Singleton instance */
export const mediaUploadManager = new MediaUploadManager();