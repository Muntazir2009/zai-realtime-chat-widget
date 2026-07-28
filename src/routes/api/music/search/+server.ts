import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// @ts-expect-error — Vite/SvelteKit handles JSON imports natively
import cacheData from '$lib/music/search-cache.json';

type CacheEntry = {
  tracks: Array<{
    id: string;
    title: string;
    artist: string;
    duration: number;
    thumbnail: string;
    videoUrl: string;
  }>;
};

const cache: Record<string, CacheEntry> = cacheData as Record<string, CacheEntry>;

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim().toLowerCase();
  if (!q) return json({ tracks: [] });

  // Exact match
  if (cache[q]) {
    return json(cache[q]);
  }

  // Partial match — check if any cached key contains the query or vice versa
  for (const [key, val] of Object.entries(cache)) {
    if (key.includes(q) || q.includes(key)) {
      return json(val);
    }
  }

  // Word-level matching
  const queryWords = q.split(/\s+/);
  let bestMatch: { key: string; score: number; val: CacheEntry } | null = null;
  for (const [key, val] of Object.entries(cache)) {
    const keyLower = key.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (keyLower.includes(word)) score++;
    }
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { key, score, val };
    }
  }
  if (bestMatch) {
    return json(bestMatch.val);
  }

  // Search track titles + artists across all cached results
  const allTracks: CacheEntry['tracks'] = [];
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
    return json({ tracks: allTracks.slice(0, 15) });
  }

  return json({ tracks: [] });
};
