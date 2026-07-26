// ============================================================
// Storage — Uploads to R2 via Cloudflare Worker.
//
// All files (images, videos, voice, avatars, wallpapers) are
// uploaded as FormData POST to the Cloudflare Worker, which
// stores them in R2 and returns the public URL.
//
// Client-side features preserved:
//   - Image compression (WebP/JPEG with max-width scaling)
//   - Upload cancellation via AbortSignal
//   - Rich progress reporting (speed, ETA, phases)
//   - Video/image metadata extraction
//   - Parallel blurhash + compression
// ============================================================

import { browser } from '$app/environment';

// ── Worker Configuration ─────────────────────────────────

const WORKER_URL = 'https://chatfolder.killermunu.workers.dev/';
const R2_PUBLIC_URL = 'https://pub-5015d5428b174f55a02bb5e740d63919.r2.dev';

// ── Types ─────────────────────────────────────────────────

export interface UploadResult {
  publicUrl: string;
  key: string;
  blurhash?: string;
}

export interface UploadProgress {
  percentage: number;    // 0-100
  loaded: number;        // bytes uploaded so far
  total: number;         // total bytes
  speed: number;         // bytes per second
  eta: number;           // estimated seconds remaining (-1 if unknown)
  phase: 'preparing' | 'uploading' | 'processing' | 'done';
}

export interface UploadOptions {
  signal?: AbortSignal;
  onDetailedProgress?: (info: UploadProgress) => void;
  skipCompression?: boolean;
  compressMaxWidth?: number;
  compressQuality?: number;
}

// ── Progress Tracker ──────────────────────────────────────

/** Rolling-window speed calculator (last 5 samples). */
class ProgressTracker {
  private samples: { ts: number; loaded: number }[] = [];
  private maxSamples = 5;

  /** Record a data point. */
  push(loaded: number): void {
    const ts = performance.now();
    this.samples.push({ ts, loaded });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /** Calculate current speed in bytes/second. Returns 0 if not enough data. */
  getSpeed(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const elapsed = (last.ts - first.ts) / 1000; // seconds
    if (elapsed <= 0) return 0;
    return (last.loaded - first.loaded) / elapsed;
  }

  /** Calculate ETA in seconds from remaining bytes and current speed. */
  getEta(loaded: number, total: number): number {
    const speed = this.getSpeed();
    if (speed <= 0 || total <= 0) return -1;
    const remaining = total - loaded;
    if (remaining <= 0) return 0;
    return remaining / speed;
  }

  reset(): void {
    this.samples = [];
  }
}

// ── Blurhash Generation (runs in parallel / before upload) ──

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

// ── Image Compression ─────────────────────────────────────

/**
 * Compress an image file to WebP (or JPEG fallback).
 * - Scales down to maxWidth while keeping aspect ratio.
 * - Skips compression if image is already small (width <= maxWidth AND < 500KB).
 * - Returns original file if compressed version isn't smaller.
 * - Returns null if compression fails entirely.
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  quality = 0.82,
): Promise<File | null> {
  if (!browser) return null;

  try {
    // Load image with EXIF orientation
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Failed to load image for compression'));
      // Respect EXIF orientation via CSS
      img.style.imageOrientation = 'from-image';
      img.src = url;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // Skip compression if image is already small enough
    if (width <= maxWidth && file.size < 500_000) {
      URL.revokeObjectURL(url);
      return file;
    }

    // Calculate scaled dimensions (maintain aspect ratio)
    let targetW = width;
    let targetH = height;
    if (width > maxWidth) {
      const scale = maxWidth / width;
      targetW = maxWidth;
      targetH = Math.round(height * scale);
    }

    // Use OffscreenCanvas if available, otherwise regular canvas
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(targetW, targetH);
      ctx = (canvas as OffscreenCanvas).getContext('2d')!;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      ctx = (canvas as HTMLCanvasElement).getContext('2d')!;
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);
    URL.revokeObjectURL(url);

    // Determine format: prefer WebP, fallback to JPEG
    const mimeType = 'image/webp'; // Modern browsers all support WebP
    const fallbackMime = 'image/jpeg';
    const jpegQuality = 0.85;

    // Try WebP first
    let blob: Blob | null = null;

    if (canvas instanceof OffscreenCanvas) {
      blob = await canvas.convertToBlob({ type: mimeType, quality });
    } else {
      blob = await new Promise<Blob | null>((resolve) => {
        (canvas as HTMLCanvasElement).toBlob(
          (b) => resolve(b),
          mimeType,
          quality,
        );
      });
    }

    // Fallback to JPEG if WebP not supported or produced too large result
    if (!blob || blob.size >= file.size) {
      if (canvas instanceof OffscreenCanvas) {
        blob = await canvas.convertToBlob({ type: fallbackMime, quality: jpegQuality });
      } else {
        blob = await new Promise<Blob | null>((resolve) => {
          (canvas as HTMLCanvasElement).toBlob(
            (b) => resolve(b),
            fallbackMime,
            jpegQuality,
          );
        });
      }
    }

    if (!blob) return null;

    // If compressed is not smaller, return original
    if (blob.size >= file.size) return file;

    // Build compressed File with appropriate extension
    const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const compressedName = `${baseName}${ext}`;

    return new File([blob], compressedName, { type: blob.type });
  } catch (err) {
    console.warn('[storage] Image compression failed:', err);
    return null;
  }
}

// ── Image Metadata ────────────────────────────────────────

/**
 * Load an image file and return its dimensions.
 */
export async function getImageMetadata(file: File): Promise<{ width: number; height: number }> {
  if (!browser) return { width: 0, height: 0 };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for metadata'));
    };
    img.src = url;
  });
}

// ── Video Metadata ────────────────────────────────────────

/**
 * Load a video file and extract metadata + thumbnail.
 * Seeks to 1s (or 10% of duration) for thumbnail generation.
 */
export async function getVideoMetadata(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
  thumbnailDataUrl: string | null;
}> {
  if (!browser) {
    return { duration: 0, width: 0, height: 0, thumbnailDataUrl: null };
  }

  const video = document.createElement('video');
  video.preload = 'metadata';
  const url = URL.createObjectURL(file);
  video.src = url;

  // Wait for metadata to load
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video metadata'));
  });

  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  // Seek to thumbnail position
  const seekTime = Math.min(1, duration * 0.1);
  video.currentTime = seekTime;

  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  // Generate JPEG thumbnail (360px wide, 70% quality)
  let thumbnailDataUrl: string | null = null;
  try {
    const canvas = document.createElement('canvas');
    const thumbWidth = 360;
    const scale = thumbWidth / Math.max(video.videoWidth, 1);
    const thumbHeight = Math.round(video.videoHeight * scale);
    canvas.width = thumbWidth;
    canvas.height = thumbHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);
    thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    // Thumbnail generation failed — non-critical
  }

  URL.revokeObjectURL(url);
  return { duration, width, height, thumbnailDataUrl };
}

// ── Helper: build detailed progress reporter for XHR ──────

function createProgressReporter(
  onProgress: ((pct: number) => void) | undefined,
  onDetailedProgress: ((info: UploadProgress) => void) | undefined,
  total: number,
  phase: UploadProgress['phase'],
  pctScale = 1,
  pctOffset = 0,
): { onXhrProgress: (e: ProgressEvent) => void; reportDone: () => void } {
  const tracker = new ProgressTracker();
  let done = false;

  const report = (loaded: number, currentPhase: UploadProgress['phase']) => {
    if (total <= 0) return;
    const rawPct = (loaded / total) * 100;
    const scaledPct = Math.min(100, pctOffset + rawPct * pctScale);

    tracker.push(loaded);
    const speed = tracker.getSpeed();
    const eta = tracker.getEta(loaded, total);

    onProgress?.(Math.round(scaledPct));

    if (onDetailedProgress) {
      onDetailedProgress({
        percentage: Math.round(scaledPct * 10) / 10,
        loaded,
        total,
        speed,
        eta,
        phase: currentPhase,
      });
    }
  };

  return {
    onXhrProgress: (e: ProgressEvent) => {
      if (!e.lengthComputable) return;
      report(e.loaded, phase);
    },
    reportDone: () => {
      if (done) return;
      done = true;
      report(total, 'done');
    },
  };
}

// ── Worker Upload (single method) ────────────────────────

/**
 * Upload a file to R2 via the Cloudflare Worker.
 * Uses FormData POST with XHR for progress tracking.
 */
async function uploadViaWorker(
  file: Blob,
  filename: string,
  contentType: string,
  folder: string,
  onProgress?: (pct: number) => void,
  onDetailedProgress?: (info: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<{ publicUrl: string; key: string }> {
  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  const formData = new FormData();
  formData.append('file', file instanceof File ? file : new File([file], filename, { type: contentType }), filename);
  formData.append('folder', folder);

  const total = file.size;
  // Report 0-95% during upload; remaining 5% is Worker→R2 processing
  const reporter = createProgressReporter(
    onProgress,
    onDetailedProgress,
    total,
    'uploading',
    0.95,
    0,
  );

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', WORKER_URL);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        reporter.onXhrProgress(e);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Report processing phase
        if (onDetailedProgress) {
          onDetailedProgress({
            percentage: 98,
            loaded: total,
            total,
            speed: 0,
            eta: -1,
            phase: 'processing',
          });
        }
        onProgress?.(98);

        try {
          const data = JSON.parse(xhr.responseText);
          reporter.reportDone();

          // Worker may return: publicUrl, url, key
          const key = data.key || '';
          const publicUrl = data.publicUrl || data.url || (key ? `${R2_PUBLIC_URL}/${key}` : '');

          if (!publicUrl) {
            reject(new Error('Worker returned no URL'));
            return;
          }

          resolve({ publicUrl, key });
        } catch {
          reject(new Error('Invalid response from upload Worker'));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.error || `Upload Worker failed (HTTP ${xhr.status})`));
        } catch {
          reject(new Error(`Upload Worker failed (HTTP ${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Upload Worker: network error'));
    xhr.ontimeout = () => reject(new Error('Upload Worker: request timed out'));
    xhr.timeout = 120_000; // 2 minutes

    // Wire up abort signal via event listener (XHR has no .signal property)
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
      }, { once: true });
    }

    xhr.onabort = () => {
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    xhr.send(formData);
  });
}

// ── Public API ────────────────────────────────────────────

/**
 * Upload a file to R2 via Cloudflare Worker.
 *
 * Client-side processing (image compression, blurhash) runs in parallel
 * with the upload preparation. Progress is reported via callbacks.
 *
 * Pass UploadOptions for cancellation, detailed progress, and image compression.
 */
export async function uploadFile(
  file: File | Blob,
  folder?: string,
  filename?: string,
  onProgress?: (pct: number) => void,
  options?: UploadOptions,
): Promise<UploadResult> {
  if (!browser) throw new Error('Uploads only work in the browser');

  const { signal, onDetailedProgress, skipCompression, compressMaxWidth, compressQuality } = options || {};

  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  const effectiveFolder = folder || 'media';
  const originalName = filename || (file instanceof File ? file.name : `upload-${Date.now()}.bin`);
  const contentType = (file instanceof File ? file.type : file.type) || 'application/octet-stream';
  const isImage = file instanceof File && file.type.startsWith('image/');

  // Helper to report phase
  const reportPhase = (phase: UploadProgress['phase'], pct: number) => {
    onProgress?.(pct);
    if (onDetailedProgress) {
      onDetailedProgress({
        percentage: pct,
        loaded: 0,
        total: file.size,
        speed: 0,
        eta: -1,
        phase,
      });
    }
  };

  // ── Preparing phase ──
  reportPhase('preparing', 0);

  // ── Parallel work: blurhash + compression ──

  let fileToUpload: File | Blob = file;
  let finalFilename = originalName;
  let finalContentType = contentType;

  // Start blurhash generation (images only)
  const blurhashPromise = isImage
    ? generateBlurhash(file as File)
    : Promise.resolve('');

  // Start image compression (images only, unless skipped)
  const compressionPromise = (isImage && !skipCompression)
    ? compressImage(
        file as File,
        compressMaxWidth || 1920,
        compressQuality || 0.82,
      ).then((compressed) => {
        if (compressed) {
          fileToUpload = compressed;
          finalFilename = compressed.name;
          finalContentType = compressed.type;
        }
      })
    : Promise.resolve();

  // Wait for parallel work
  reportPhase('preparing', 2);
  const [blurhash] = await Promise.all([blurhashPromise, compressionPromise]);

  // Re-check abort after parallel work
  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  reportPhase('preparing', 10);

  // Upload via Worker
  reportPhase('uploading', 12);
  const result = await uploadViaWorker(
    fileToUpload,
    finalFilename,
    finalContentType,
    effectiveFolder,
    onProgress,
    onDetailedProgress,
    signal,
  );

  // Build final result
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
  options?: UploadOptions,
): Promise<UploadResult & { blurhash: string }> {
  const result = await uploadFile(file, folder, file.name, onProgress, options);
  return {
    publicUrl: result.publicUrl,
    key: result.key,
    blurhash: result.blurhash || '',
  };
}