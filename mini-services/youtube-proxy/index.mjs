import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Range'],
}));

// ── Innertube singleton (works with Node.js) ──
let _innertube = null;
let _initPromise = null;

async function getInnertube() {
  if (_innertube) return _innertube;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const { Innertube } = await import('youtubei.js');
      _innertube = await Innertube.create({ generate_session_locally: true });
      console.log('[YT-Proxy] Innertube ready');
      return _innertube;
    } catch (err) {
      _initPromise = null;
      throw err;
    }
  })();
  return _initPromise;
}

// ── Search ──
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

    return c.json({ tracks });
  } catch (err) {
    console.error('[YT-Proxy] Search error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Stream: Use yt.download() for reliable stream URL ──
app.get('/stream/:videoId', async (c) => {
  const videoId = c.req.param('videoId');
  if (!videoId) return c.json({ error: 'Missing videoId' }, 400);

  try {
    const yt = await getInnertube();
    console.log(`[YT-Proxy] Getting stream for ${videoId}...`);

    // Method 1: getInfo + adaptive_formats
    let info;
    try {
      info = await yt.getInfo(videoId);
    } catch (e) {
      console.log(`[YT-Proxy] getInfo failed, trying basic_info...`);
      return c.json({ error: 'Could not get video info' }, 404);
    }

    // Check all format sources
    const allFormats = [
      ...(info.streaming_data?.adaptive_formats ?? []),
      ...(info.streaming_data?.formats ?? []),
    ];

    console.log(`[YT-Proxy] Total formats: ${allFormats.length}`);

    const audioFormats = allFormats
      .filter(f => {
        const mime = String(f.mime_type ?? '');
        return mime.startsWith('audio/') && f.url;
      })
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    if (audioFormats.length > 0) {
      console.log(`[YT-Proxy] Found ${audioFormats.length} audio formats`);
      return c.json({ url: audioFormats[0].url });
    }

    // Fallback: any format with URL
    const anyFormat = allFormats.find(f => f.url);
    if (anyFormat) {
      console.log(`[YT-Proxy] Using non-audio format as fallback`);
      return c.json({ url: anyFormat.url });
    }

    // YouTube requires login for streaming in this sandbox.
    // Use cobalt API as fallback for stream URLs.
    console.log(`[YT-Proxy] YT login required, trying cobalt API...`);
    
    try {
      const cobaltRes = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          downloadMode: 'audio',
          audioFormat: 'mp3',
        }),
        signal: AbortSignal.timeout(15000),
      });
      
      if (cobaltRes.ok) {
        const cobaltData = await cobaltRes.json();
        if (cobaltData.url) {
          return c.json({ url: cobaltData.url });
        }
      }
    } catch (e3) {
      console.log(`[YT-Proxy] Cobalt failed:`, e3.message);
    }

    return c.json({ error: 'Audio streaming unavailable in this environment. Try a different track.' }, 403);
  } catch (err) {
    console.error('[YT-Proxy] Stream error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Resolve ──
app.get('/resolve', async (c) => {
  const q = c.req.query('q');
  if (!q?.trim()) return c.json({ error: 'Missing query' }, 400);

  try {
    const videoId = extractVideoId(q.trim());
    if (videoId) {
      const yt = await getInnertube();
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

    const yt = await getInnertube();
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
