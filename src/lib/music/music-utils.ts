// ============================================================
// music-utils.ts — Shared helpers for the music module
// ============================================================

/** Format seconds to M:SS or H:MM:SS */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format a progress ratio (0-1) to M:SS / M:SS */
export function formatProgress(current: number, total: number): string {
  return `${formatDuration(current)} / ${formatDuration(total)}`;
}

/** Parse a youtube duration string like "PT3H25M30S" */
export function parseYTDuration(iso: string): number {
  if (!iso || !iso.startsWith('PT')) return 0;
  let seconds = 0;
  const h = iso.match(/(\d+)H/);
  const m = iso.match(/(\d+)M/);
  const s = iso.match(/(\d+)S/);
  if (h) seconds += parseInt(h[1], 10) * 3600;
  if (m) seconds += parseInt(m[1], 10) * 60;
  if (s) seconds += parseInt(s[1], 10);
  return seconds;
}

/** LRU thumbnail cache — keeps URLs in memory so we don't re-fetch */
const thumbCache = new Map<string, string>();

export function cacheThumbnail(videoId: string, url: string): void {
  if (url) thumbCache.set(videoId, url);
}

export function getCachedThumbnail(videoId: string): string | undefined {
  return thumbCache.get(videoId);
}

/** Extract YouTube video ID from a URL or search term */
export function extractVideoId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.trim().match(p);
    if (m) return m[1];
  }
  return null;
}

/** Truncate text with ellipsis */
export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
