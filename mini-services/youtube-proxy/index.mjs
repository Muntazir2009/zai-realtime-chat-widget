import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

const app = new Hono();
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'], allowHeaders: ['Content-Type', 'Range'] }));

app.get('/health', (c) => c.json({ status: 'ok', innertube: _innertube ? 'ready' : 'not_init' }));

let _innertube = null;
let _initPromise = null;

async function getInnertube() {
  if (_innertube) return _innertube;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      console.log('[YT-Proxy] Initializing Innertube...');
      const { Innertube } = await import('youtubei.js');
      _innertube = await Innertube.create({ generate_session_locally: true });
      console.log('[YT-Proxy] Innertube ready!');
      return _innertube;
    } catch (err) {
      _initPromise = null;
      console.error('[YT-Proxy] Init failed:', err.message);
      throw err;
    }
  })();
  return _initPromise;
}

app.get('/health', (c) => c.json({ status: 'ok', innertube: _innertube ? 'ready' : 'not_init', uptime: process.uptime() }));

app.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q?.trim()) return c.json({ error: 'Missing query' }, 400);
  try {
    const yt = await getInnertube();
    const results = await yt.search(q.trim(), { type: 'video' });
    const tracks = (results?.videos ?? [])
      .filter(v => v.type === 'Video' && v.id && v.title)
      .slice(0, 15)
      .map(v => ({
        id: v.id,
        title: String(v.title?.text ?? v.title ?? '').replace(/\s*\[.*?\]\s*/g, ' ').trim(),
        artist: v.channel?.name?.text ?? v.channel?.name ?? 'Unknown',
        duration: typeof v.duration === 'number' ? v.duration : (v.duration?.seconds ?? 0),
        thumbnail: v.thumbnails?.[0]?.url ?? '',
        videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
      }));
    console.log(`[YT-Proxy] Found ${tracks.length} tracks`);
    return c.json({ tracks });
  } catch (err) {
    console.error('[YT-Proxy] Search error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get('/resolve', async (c) => {
  const q = c.req.query('q');
  if (!q?.trim()) return c.json({ error: 'Missing query' }, 400);
  try {
    const yt = await getInnertube();
    const videoId = extractVideoId(q.trim());
    if (videoId) {
      const info = await yt.getInfo(videoId);
      const v = info.basic_info ?? {};
      return c.json({
        id: videoId,
        title: String(v.title?.text ?? v.title ?? 'Unknown').replace(/\s*\[.*?\]\s*/g, ' ').trim(),
        artist: v.channel?.name?.text ?? v.channel?.name ?? 'Unknown',
        duration: typeof v.duration === 'number' ? v.duration : (v.duration?.seconds ?? 0),
        thumbnail: v.thumbnail?.[0]?.url ?? '',
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
    const results = await yt.search(q.trim(), { type: 'video' });
    const v = results?.videos?.[0];
    if (!v) return c.json({ error: 'No results' }, 404);
    return c.json({
      id: v.id,
      title: String(v.title?.text ?? v.title ?? '').replace(/\s*\[.*?\]\s*/g, ' ').trim(),
      artist: v.channel?.name?.text ?? v.channel?.name ?? 'Unknown',
      duration: typeof v.duration === 'number' ? v.duration : (v.duration?.seconds ?? 0),
      thumbnail: v.thumbnails?.[0]?.url ?? '',
      videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
    });
  } catch (err) {
    console.error('[YT-Proxy] Resolve error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

function extractVideoId(input) {
  const m = input.trim().match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : (/^([a-zA-Z0-9_-]{11})$/.test(input.trim()) ? input.trim() : null);
}

const PORT = 3010;
console.log(`[YT-Proxy] Starting on port ${PORT}`);
serve({ fetch: app.fetch, port: PORT });
console.log(`[YT-Proxy] Server running at http://localhost:${PORT}`);
