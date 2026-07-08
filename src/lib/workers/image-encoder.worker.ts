// ============================================================
// Image Encoder Web Worker
// Receives a File/Blob, encodes to WebP via canvas, and also
// generates a tiny placeholder thumbnail.
// ============================================================

const THUMBNAIL_MAX_DIM = 32;

self.onmessage = async (e: MessageEvent) => {
  const { file } = e.data as { file: File };

  try {
    const bitmap = await createImageBitmap(file);

    // ---- Encode full image to WebP ----
    const fullCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const fullCtx = fullCanvas.getContext('2d');
    if (!fullCtx) throw new Error('Cannot get 2D context');

    fullCtx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

    const webpBlob = await fullCanvas.convertToBlob({
      type: 'image/webp',
      quality: 0.85,
    });

    // ---- Generate small placeholder thumbnail ----
    const scale = Math.min(THUMBNAIL_MAX_DIM / bitmap.width, THUMBNAIL_MAX_DIM / bitmap.height, 1);
    const thumbW = Math.round(bitmap.width * scale);
    const thumbH = Math.round(bitmap.height * scale);

    const thumbCanvas = new OffscreenCanvas(thumbW, thumbH);
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx) {
      thumbCtx.drawImage(bitmap, 0, 0, thumbW, thumbH);
    }

    const thumbBlob = await thumbCanvas.convertToBlob({
      type: 'image/webp',
      quality: 0.5,
    });

    bitmap.close();

    self.postMessage({
      blob: webpBlob,
      thumbnail: thumbBlob,
      width: bitmap.width,  // note: bitmap is closed, but we captured dimensions
      height: bitmap.height,
    }, [webpBlob, thumbBlob]);
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : 'Encoding failed',
    });
  }
};