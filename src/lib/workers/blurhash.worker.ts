// ============================================================
// Blurhash Web Worker
// Receives ImageData and encodes it to a blurhash string.
// Uses the `blurhash` library (works in workers when bundled).
// Fallback: returns a simple gradient placeholder on failure.
// ============================================================

import { encode } from 'blurhash';

const FALLBACK_HASH = 'LKO2:N%2Tw=w]~RBVZRi};RPxuwH';

self.onmessage = async (e: MessageEvent) => {
  const { imageData, width, height, componentX, componentY } = e.data as {
    imageData: ImageData;
    width: number;
    height: number;
    componentX?: number;
    componentY?: number;
  };

  try {
    const hash = encode(
      imageData.data,
      width,
      height,
      componentX ?? 4,
      componentY ?? 3,
    );

    self.postMessage({ hash });
  } catch (err) {
    console.warn('[blurhash.worker] Encode failed, using fallback:', err);
    self.postMessage({ hash: FALLBACK_HASH });
  }
};