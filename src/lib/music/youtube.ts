// ============================================================
// youtube.ts — YouTube search via local SvelteKit API route
// Uses a pre-built static cache of YouTube search results.
// Playback uses YouTube IFrame Player API (client-side).
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

/** Search YouTube for music tracks via local API */
export async function searchMusic(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return [];

  try {
    const res = await fetch(`/api/music/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();
    return (data.tracks ?? []) as YTSearchResult[];
  } catch (err) {
    console.error('[YouTube] Search failed:', err);
    return [];
  }
}

/** Resolve a query to a single track */
export async function resolveTrack(input: string): Promise<Track | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Extract video ID from URL
  const videoId = extractVideoId(trimmed);
  if (videoId) {
    return {
      id: videoId,
      title: extractTitleFromUrl(trimmed) || 'YouTube Video',
      artist: '',
      duration: 0,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  // Search and return first result
  const results = await searchMusic(trimmed);
  if (results.length === 0) return null;

  const r = results[0];
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    thumbnail: r.thumbnail,
    url: r.videoUrl,
  };
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

/** No-op */
export function clearCaches(): void {}

// ── Helpers ──
function extractVideoId(input: string): string | null {
  const m = input.trim().match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : (/^([a-zA-Z0-9_-]{11})$/.test(input.trim()) ? input.trim() : null);
}

function extractTitleFromUrl(url: string): string | null {
  return null; // We don't have a way to get title from URL without an API
}
