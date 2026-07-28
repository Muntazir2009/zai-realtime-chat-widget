// ============================================================
// youtube.ts — YouTube search & stream service using youtubei.js
// Lazy-initialized singleton. Only created when first needed.
// ============================================================

import type { Track } from './player-store.svelte.js';
import { parseYTDuration, cacheThumbnail, extractVideoId } from './music-utils.js';

type Innertube = any;

let _innertube: Innertube | null = null;
let _initPromise: Promise<Innertube> | null = null;

/** Get or create the Innertube instance (singleton, lazy) */
async function getInnertube(): Promise<Innertube> {
  if (_innertube) return _innertube;
  if (_initPromise) return _initPromise;
  _initPromise = _createInnertube();
  return _initPromise;
}

async function _createInnertube(): Promise<Innertube> {
  try {
    const { Innertube } = await import('youtubei.js');
    _innertube = new Innertube({ generate_session_locally: true });
    return _innertube;
  } catch (err) {
    _initPromise = null;
    throw err;
  }
}

export interface YTSearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;   // seconds
  thumbnail: string;
  videoUrl: string;
}

const searchCache = new Map<string, YTSearchResult[]>();

/** Search YouTube for music tracks */
export async function searchMusic(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return [];

  const cacheKey = query.trim().toLowerCase();
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;

  try {
    const yt = await getInnertube();
    const results = await yt.search(query.trim(), { type: 'video' });

    if (!results?.videos?.length) return [];

    const tracks: YTSearchResult[] = results.videos
      .filter((v: any) => v.type === 'Video' && v.id && v.title)
      .slice(0, 20)
      .map((v: any) => {
        const dur = parseYTDuration(v.duration ?? '');
        const thumb = v.thumbnails?.[0]?.url ?? v.thumbnail ?? '';
        cacheThumbnail(v.id, thumb);
        return {
          id: v.id,
          title: (v.title as string).replace(/\s*\[.*?\]\s*/g, ' ').trim(),
          artist: v.channel?.name ?? 'Unknown',
          duration: dur,
          thumbnail: thumb,
          videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
        };
      });

    searchCache.set(cacheKey, tracks);

    // Prune cache: keep only last 50 searches
    if (searchCache.size > 50) {
      const keys = Array.from(searchCache.keys());
      for (let i = 0; i < keys.length - 50; i++) searchCache.delete(keys[i]);
    }

    return tracks;
  } catch (err) {
    console.error('[YouTube] Search failed:', err);
    throw new Error('Music search failed. Please try again.');
  }
}

/** Get a direct audio stream URL for a video */
export async function getAudioStreamUrl(videoId: string): Promise<string> {
  try {
    const yt = await getInnertube();

    const info = await yt.getInfo(videoId);
    const formats = (info.streaming_data?.adaptive_formats ?? [])
      .filter((f: any) => f.mime_type?.startsWith('audio/') && f.url)
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    if (formats.length === 0) throw new Error('No audio stream found');

    // Prefer highest bitrate
    return formats[0].url;
  } catch (err) {
    console.error('[YouTube] Stream fetch failed for', videoId, err);
    throw new Error('Could not load audio stream. Skipping...');
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

/** Parse a /play or /queue command — if it's a URL, extract the ID */
export async function resolveTrack(input: string): Promise<Track | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check if it's a direct video ID or URL
  const videoId = extractVideoId(trimmed);
  if (videoId) {
    // Fetch metadata from YouTube
    try {
      const yt = await getInnertube();
      const info = await yt.getInfo(videoId);
      const v = info.basic_info ?? {};
      const dur = parseYTDuration(v.duration ?? '');
      const thumb = v.thumbnail?.[0]?.url ?? '';
      cacheThumbnail(videoId, thumb);
      return {
        id: videoId,
        title: v.title ?? 'Unknown',
        artist: v.channel?.name ?? 'Unknown',
        duration: dur,
        thumbnail: thumb,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch {
      return null;
    }
  }

  // Otherwise search and use the first result
  const results = await searchMusic(trimmed);
  if (results.length === 0) return null;
  return ytResultToTrack(results[0]);
}

/** Clear all caches */
export function clearCaches(): void {
  searchCache.clear();
}
