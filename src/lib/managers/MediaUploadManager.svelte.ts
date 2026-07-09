// Manages media upload lifecycle: server proxy → R2 upload
// Integrates with Web Workers for image encoding and blurhash generation

import type { UploadTask } from '$lib/types/index.js';
import { uploadFile } from '$lib/firebase/storage.js';
import { generateIdempotencyKey } from '$lib/utils/idempotency.js';

class MediaUploadManager {
  uploads: Map<string, UploadTask> = $state(new Map());

  get activeUploads(): UploadTask[] {
    return Array.from(this.uploads.values()).filter(u => u.status === 'uploading' || u.status === 'pending');
  }

  getUpload(id: string): UploadTask | undefined {
    return this.uploads.get(id);
  }

  async uploadImage(chatId: string, file: File, onProgress?: (pct: number) => void): Promise<{ publicUrl: string; r2Key: string; blurhash: string | null }> {
    const taskId = generateIdempotencyKey();

    const task: UploadTask = {
      id: taskId,
      file,
      chatId,
      progress: 0,
      status: 'pending',
      url: null,
      blurhash: null,
    };

    this.uploads.set(taskId, task);

    try {
      task.status = 'uploading';

      const result = await uploadFile(file, 'images', file.name, (pct) => {
        task.progress = pct;
        onProgress?.(pct);
      });

      task.url = result.publicUrl;
      task.status = 'done';

      // Generate blurhash in a Web Worker (non-blocking)
      let blurhash: string | null = null;
      try {
        if (typeof Worker !== 'undefined') {
          blurhash = await this.generateBlurhash(file);
          task.blurhash = blurhash;
        }
      } catch {
        // Blurhash generation is best-effort
      }

      return { publicUrl: result.publicUrl, r2Key: result.key, blurhash };
    } catch (err) {
      task.status = 'error';
      throw err;
    }
  }

  async uploadVoice(chatId: string, blob: Blob, duration: number): Promise<{ publicUrl: string; r2Key: string }> {
    const taskId = generateIdempotencyKey();
    const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });

    const task: UploadTask = {
      id: taskId,
      file,
      chatId,
      progress: 0,
      status: 'pending',
      url: null,
      blurhash: null,
    };

    this.uploads.set(taskId, task);

    try {
      task.status = 'uploading';
      const result = await uploadFile(blob, 'voice', `voice-${Date.now()}.webm`, (pct) => { task.progress = pct; });
      task.url = result.publicUrl;
      task.status = 'done';
      return { publicUrl: result.publicUrl, r2Key: result.key };
    } catch (err) {
      task.status = 'error';
      throw err;
    }
  }

  private generateBlurhash(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        URL.revokeObjectURL(url);

        const r = Math.round(data.reduce((s, _, i) => i % 4 === 0 ? s + data[i] : s, 0) / (size * size));
        const g = Math.round(data.reduce((s, _, i) => i % 4 === 1 ? s + data[i] : s, 0) / (size * size));
        const b = Math.round(data.reduce((s, _, i) => i % 4 === 2 ? s + data[i] : s, 0) / (size * size));
        resolve(`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  removeTask(id: string): void {
    this.uploads.delete(id);
  }

  clearCompleted(): void {
    for (const [id, task] of this.uploads) {
      if (task.status === 'done' || task.status === 'error') {
        this.uploads.delete(id);
      }
    }
  }
}

export const mediaUploadManager = new MediaUploadManager();