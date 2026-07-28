// ============================================================
// youtube.ts — YouTube search via proxy service
// All search/resolve requests go through the mini-service on port 3010.
// Playback uses YouTube IFrame Player API (client-side), so no
// stream URL fetching is needed.
// ============================================================

import type { Track } from './player-store.svelte.js';

export interface YTSearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  videoUrl: string;
}

const PROXY_BASE = '/?XTransformPort=3010';

/** Search YouTube for music tracks */
export async function searchMusic(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return [];

  try {
    const res = await fetch(`${PROXY_BASE}/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();
    return (data.tracks ?? []) as YTSearchResult[];
  } catch (err) {
    console.error('[YouTube] Search failed:', err);
    return [];
  }
}

/** Resolve a query (URL or search term) to a single track */
export async function resolveTrack(input: string): Promise<Track | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch(`${PROXY_BASE}/resolve?q=${encodeURIComponent(trimmed)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id,
      title: data.title,
      artist: data.artist,
      duration: data.duration ?? 0,
      thumbnail: data.thumbnail ?? '',
      url: data.videoUrl ?? `https://www.youtube.com/watch?v=${data.id}`,
    };
  } catch (err) {
    console.error('[YouTube] Resolve failed:', err);
    return null;
  }
}

/** Convert a YTSearchResult to a Track */
export function ytResultToTrack(r: YTSearchResult): Track {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    thumbnail: r.thumbnail,
    url: r.videoUrl,
  };
}

/** No-op — kept for API compatibility */
export function clearCaches(): void {}
