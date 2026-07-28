// ============================================================
// youtube.ts — YouTube search & stream via proxy service
// All requests go through the mini-service on port 3010
// to avoid CORS issues and keep youtubei.js on the server.
// ============================================================

import type { Track } from './player-store.svelte.js';
import { extractVideoId } from './music-utils.js';

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

/** Get a proxied audio stream URL for a video */
export async function getAudioStreamUrl(videoId: string): Promise<string> {
  // First try the relay endpoint (proxied to avoid CORS)
  // The audio.ts service will handle the actual playback
  try {
    const res = await fetch(`${PROXY_BASE}/stream/${videoId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
    }
  } catch (err) {
    console.error('[YouTube] Stream URL fetch failed, falling back to relay:', err);
  }

  // Fallback: use relay endpoint which proxies the actual bytes
  return `${PROXY_BASE}/relay/${videoId}`;
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

/** Parse a /play or /queue command — if it's a URL, extract the ID */
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

/** Clear all caches (no-op since proxy handles caching) */
export function clearCaches(): void {}
