// ============================================================
// youtube.ts — Client-side YouTube search via static cache
// Fetches /search-cache.json (served as static asset by Vite).
// All search runs in the browser — no server route needed.
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

type CacheEntry = {
  tracks: YTSearchResult[];
};

let _cache: Record<string, CacheEntry> | null = null;
let _cachePromise: Promise<Record<string, CacheEntry>> | null = null;

async function getCache(): Promise<Record<string, CacheEntry>> {
  if (_cache) return _cache;
  if (_cachePromise) return _cachePromise;

  _cachePromise = (async () => {
    try {
      const res = await fetch('/search-cache.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _cache = data as Record<string, CacheEntry>;
      console.log('[YouTube] Search cache loaded:', Object.keys(_cache).length, 'keys');
      return _cache!;
    } catch (err) {
      console.error('[YouTube] Failed to load search cache:', err);
      return {} as Record<string, CacheEntry>;
    }
  })();

  return _cachePromise;
}

/** Search YouTube for music tracks using local static cache */
export async function searchMusic(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return [];

  const q = query.trim().toLowerCase();
  const cache = await getCache();

  // 1. Exact key match
  if (cache[q]) {
    return cache[q].tracks;
  }

  // 2. Partial key match (cache key contains query or vice versa)
  for (const [key, val] of Object.entries(cache)) {
    if (key.includes(q) || q.includes(key)) {
      return val.tracks;
    }
  }

  // 3. Word-level key matching (find best score)
  const queryWords = q.split(/\s+/).filter(w => w.length > 1);
  if (queryWords.length > 0) {
    let bestMatch: CacheEntry | null = null;
    let bestScore = 0;
    for (const [key, val] of Object.entries(cache)) {
      const keyLower = key.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (keyLower.includes(word)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = val;
      }
    }
    if (bestMatch && bestScore >= 1) {
      return bestMatch.tracks;
    }
  }

  // 4. Fuzzy search across all track titles + artists
  const allTracks: YTSearchResult[] = [];
  const seenIds = new Set<string>();
  for (const val of Object.values(cache)) {
    for (const track of val.tracks ?? []) {
      if (seenIds.has(track.id)) continue;
      seenIds.add(track.id);
      const titleLower = (track.title + ' ' + track.artist).toLowerCase();
      if (titleLower.includes(q)) {
        allTracks.push(track);
      }
    }
  }
  if (allTracks.length > 0) {
    return allTracks.slice(0, 15);
  }

  // 5. Single-word loose match on track titles
  for (const word of queryWords) {
    for (const val of Object.values(cache)) {
      for (const track of val.tracks ?? []) {
        if (seenIds.has(track.id)) continue;
        seenIds.add(track.id);
        const titleLower = (track.title + ' ' + track.artist).toLowerCase();
        if (titleLower.includes(word)) {
          allTracks.push(track);
        }
      }
    }
  }
  if (allTracks.length > 0) {
    return allTracks.slice(0, 15);
  }

  return [];
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
      title: 'YouTube Video',
      artist: '',
      duration: 0,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  // Search and return first result
  const results = await searchMusic(trimmed);
  if (results.length === 0) return null;

  const r = results[0]!;
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

/** Clear in-memory cache */
export function clearCaches(): void {
  _cache = null;
  _cachePromise = null;
}

// ── Helpers ──
function extractVideoId(input: string): string | null {
  const m = input.trim().match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : (/^([a-zA-Z0-9_-]{11})$/.test(input.trim()) ? input.trim() : null);
}
