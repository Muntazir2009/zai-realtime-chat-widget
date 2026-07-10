import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GIPHY public beta key for development
const GIPHY_API_KEY = 'GlVGYTkrSLWSBnllca54iNt0yFbjz7L65';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

interface GifItem {
  id: string;
  url: string;
  preview: string;
  title: string;
  width: number;
  height: number;
}

// Curated fallback GIFs (used when API fails or no key)
const CURATED_GIFS: GifItem[] = [
  { id: 'c1', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif', preview: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/200w_d.gif', title: 'Thumbs Up', width: 480, height: 480 },
  { id: 'c2', url: 'https://media.giphy.com/media/4NQm2BS9B8MqI/giphy.gif', preview: 'https://media.giphy.com/media/4NQm2BS9B8MqI/200w_d.gif', title: 'Mind Blown', width: 400, height: 400 },
  { id: 'c3', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', preview: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w_d.gif', title: 'Laugh', width: 480, height: 270 },
  { id: 'c4', url: 'https://media.giphy.com/media/10Jjvi7wEKWbJW/giphy.gif', preview: 'https://media.giphy.com/media/10Jjvi7wEKWbJW/200w_d.gif', title: 'Celebrate', width: 480, height: 350 },
  { id: 'c5', url: 'https://media.giphy.com/media/xUA7bdpLxQhsSQdyog/giphy.gif', preview: 'https://media.giphy.com/media/xUA7bdpLxQhsSQdyog/200w_d.gif', title: 'Wow', width: 480, height: 480 },
  { id: 'c6', url: 'https://media.giphy.com/media/3o7qE1YN7aBOFPRw8E/giphy.gif', preview: 'https://media.giphy.com/media/3o7qE1YN7aBOFPRw8E/200w_d.gif', title: 'Dance', width: 480, height: 270 },
  { id: 'c7', url: 'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif', preview: 'https://media.giphy.com/media/26u4cqiYI30juCOGY/200w_d.gif', title: 'Love', width: 480, height: 480 },
  { id: 'c8', url: 'https://media.giphy.com/media/l2YWypohz33wJR3C8/giphy.gif', preview: 'https://media.giphy.com/media/l2YWypohz33wJR3C8/200w_d.gif', title: 'Sad', width: 480, height: 270 },
  { id: 'c9', url: 'https://media.giphy.com/media/3o6fJ1BM7R2EBRDnxK/giphy.gif', preview: 'https://media.giphy.com/media/3o6fJ1BM7R2EBRDnxK/200w_d.gif', title: 'OK', width: 480, height: 270 },
  { id: 'c10', url: 'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif', preview: 'https://media.giphy.com/media/13HgwGsXF0aiGY/200w_d.gif', title: 'Bye', width: 480, height: 270 },
  { id: 'c11', url: 'https://media.giphy.com/media/VbnUQpnihPSIgIXuZv/giphy.gif', preview: 'https://media.giphy.com/media/VbnUQpnihPSIgIXuZv/200w_d.gif', title: 'Shocked', width: 480, height: 350 },
  { id: 'c12', url: 'https://media.giphy.com/media/telJkVOU9BwJ2/giphy.gif', preview: 'https://media.giphy.com/media/telJkVOU9BwJ2/200w_d.gif', title: 'Hmm', width: 480, height: 270 },
  { id: 'c13', url: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif', preview: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/200w_d.gif', title: 'Shrug', width: 480, height: 270 },
  { id: 'c14', url: 'https://media.giphy.com/media/du3J3cXyzhj75IOgvA/giphy.gif', preview: 'https://media.giphy.com/media/du3J3cXyzhj75IOgvA/200w_d.gif', title: 'Nope', width: 480, height: 270 },
  { id: 'c15', url: 'https://media.giphy.com/media/a5viI92PAF89q/giphy.gif', preview: 'https://media.giphy.com/media/a5viI92PAF89q/200w_d.gif', title: 'Facepalm', width: 480, height: 480 },
  { id: 'c16', url: 'https://media.giphy.com/media/ytV0ehCNzjv32/giphy.gif', preview: 'https://media.giphy.com/media/ytV0ehCNzjv32/200w_d.gif', title: 'Nervous', width: 480, height: 270 },
  { id: 'c17', url: 'https://media.giphy.com/media/YGKx3q6M2aB1K/giphy.gif', preview: 'https://media.giphy.com/media/YGKx3q6M2aB1K/200w_d.gif', title: 'High Five', width: 480, height: 270 },
  { id: 'c18', url: 'https://media.giphy.com/media/xT0xeJpnrWC3XWblEk/giphy.gif', preview: 'https://media.giphy.com/media/xT0xeJpnrWC3XWblEk/200w_d.gif', title: 'Slow Clap', width: 480, height: 270 },
  { id: 'c19', url: 'https://media.giphy.com/media/u2puGNLJYqnGE/giphy.gif', preview: 'https://media.giphy.com/media/u2puGNLJYqnGE/200w_d.gif', title: 'Hair Flip', width: 480, height: 270 },
  { id: 'c20', url: 'https://media.giphy.com/media/l4pTfx2qLszoacZRS/giphy.gif', preview: 'https://media.giphy.com/media/l4pTfx2qLszoacZRS/200w_d.gif', title: 'Mic Drop', width: 480, height: 270 },
  { id: 'c21', url: 'https://media.giphy.com/media/3o6fJ1BM7R2EBRDnxK/giphy.gif', preview: 'https://media.giphy.com/media/3o6fJ1BM7R2EBRDnxK/200w_d.gif', title: 'Okay', width: 480, height: 270 },
  { id: 'c22', url: 'https://media.giphy.com/media/3oz8xIsloV320wMOHm/giphy.gif', preview: 'https://media.giphy.com/media/3oz8xIsloV320wMOHm/200w_d.gif', title: 'Thanks', width: 480, height: 480 },
  { id: 'c23', url: 'https://media.giphy.com/media/26FPJGjhefSJuaRhu/giphy.gif', preview: 'https://media.giphy.com/media/26FPJGjhefSJuaRhu/200w_d.gif', title: 'Eye Roll', width: 480, height: 270 },
  { id: 'c24', url: 'https://media.giphy.com/media/ohrgxbVFm7CkA/giphy.gif', preview: 'https://media.giphy.com/media/ohrgxbVFm7CkA/200w_d.gif', title: 'Cry', width: 480, height: 270 },
];

const CATEGORIES = [
  { name: 'Trending', emoji: '🔥', query: 'trending' },
  { name: 'Reactions', emoji: '😂', query: 'reactions' },
  { name: 'Love', emoji: '❤️', query: 'love' },
  { name: 'Happy', emoji: '😊', query: 'happy' },
  { name: 'Sad', emoji: '😢', query: 'sad' },
  { name: 'Angry', emoji: '😠', query: 'angry' },
  { name: 'WTF', emoji: '😱', query: 'shocked' },
  { name: 'Dance', emoji: '💃', query: 'dance' },
  { name: 'Animals', emoji: '🐱', query: 'animals' },
  { name: 'Memes', emoji: '🤣', query: 'memes' },
];

function filterCurated(query: string): GifItem[] {
  if (!query || query === 'trending') return CURATED_GIFS;
  const q = query.toLowerCase();
  return CURATED_GIFS.filter(g => g.title.toLowerCase().includes(q));
}

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q') || 'trending';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Try GIPHY API first
  if (GIPHY_API_KEY) {
    try {
      const endpoint = query === 'trending'
        ? `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=g`
        : `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=g`;

      const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        const gifs: GifItem[] = (data.data || []).map((g: any) => ({
          id: g.id,
          url: g.images?.original?.url || g.images?.downsized?.url || g.url,
          preview: g.images?.fixed_width_downsampled?.url || g.images?.fixed_width_small?.url || g.images?.preview_gif?.url || g.url,
          title: g.title || 'GIF',
          width: g.images?.original?.width || 480,
          height: g.images?.original?.height || 270,
        }));

        return json({ gifs, categories: CATEGORIES, total: data.pagination?.total_count ?? gifs.length });
      }
    } catch (err) {
      console.warn('GIPHY API failed, using curated fallback:', err);
    }
  }

  // Fallback to curated GIFs
  const filtered = filterCurated(query);
  return json({
    gifs: filtered.slice(offset, offset + limit),
    categories: CATEGORIES,
    total: filtered.length,
  });
};