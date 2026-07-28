import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:81'],
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// ── Lazy Innertube singleton ──
let _innertube = null;
let _initPromise = null;

async function getInnertube() {
  if (_innertube) return _innertube;
  if (_initPromise) return _initPromise;
  _initPromise = _create();
  return _initPromise;
}

async function _create() {
  try {
    const { Innertube } = await import('youtubei.js');
    _innertube = await Innertube.create({ generate_session_locally: true });
    return _innertube;
  } catch (err) {
    _initPromise = null;
    throw err;
  }
}

// ── Search endpoint ──
app.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q?.trim()) return c.json({ error: 'Missing query' }, 400);

  try {
    const yt = await getInnertube();
    const results = await yt.search(q.trim(), { type: 'video' });

    if (!results?.videos?.length) return c.json({ tracks: [] });

    const tracks = results.videos
      .filter(v => v.type === 'Video' && v.id && v.title)
      .slice(0, 15)
      .map(v => {
        const durObj = v.duration ?? {};
        const dur = typeof durObj === 'number' ? durObj : (durObj?.seconds ?? parseYTDuration(durObj?.text ?? durObj ?? ''));
        const thumb = v.thumbnails?.[0]?.url ?? v.thumbnail?.url ?? v.thumbnail ?? '';
        const rawTitle = String(v.title?.text ?? v.title ?? '');
        const channelName = v.channel?.name?.text ?? v.channel?.name ?? v.author?.name ?? 'Unknown';
        return {
          id: v.id,
          title: rawTitle.replace(/\s*\[.*?\]\s*/g, ' ').trim(),
          artist: channelName,
          duration: dur,
          thumbnail: thumb,
          videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
        };
      });

    return c.json({ tracks });
  } catch (err) {
    console.error('[YT-Proxy] Search error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Audio stream URL fetch ──
app.get('/stream/:videoId', async (c) => {
  const videoId = c.req.param('videoId');
  if (!videoId) return c.json({ error: 'Missing videoId' }, 400);

  try {
    const yt = await getInnertube();
    const info = await yt.getInfo(videoId);

    const formats = (info.streaming_data?.adaptive_formats ?? [])
      .filter(f => {
        const mime = f.mime_type ?? '';
        return mime.startsWith('audio/') && f.url;
      })
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    if (formats.length === 0) {
      return c.json({ error: 'No audio stream found' }, 404);
    }

    return c.json({ url: formats[0].url });
  } catch (err) {
    console.error('[YT-Proxy] Stream error for', videoId, err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Stream relay (proxies audio bytes to avoid CORS) ──
app.get('/relay/:videoId', async (c) => {
  const videoId = c.req.param('videoId');
  if (!videoId) return c.text('Missing videoId', 400);

  try {
    const yt = await getInnertube();
    const info = await yt.getInfo(videoId);

    const formats = (info.streaming_data?.adaptive_formats ?? [])
      .filter(f => {
        const mime = f.mime_type ?? '';
        return mime.startsWith('audio/') && f.url;
      })
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    if (formats.length === 0) {
      return c.text('No audio stream found', 404);
    }

    const opus = formats.find(f => (f.mime_type ?? '').includes('opus'));
    const best = opus ?? formats[0];
    const streamUrl = best.url;

    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(c.req.header('Range') ? { 'Range': c.req.header('Range') } : {}),
      },
    });

    if (!response.ok) {
      return c.text('Stream fetch failed: ' + response.status, 502);
    }

    const contentType = best.mime_type ?? 'audio/webm';
    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      'Accept-Ranges': 'bytes',
    };
    const cr = response.headers.get('Content-Range');
    if (cr) headers['Content-Range'] = cr;
    const cl = response.headers.get('Content-Length');
    if (cl) headers['Content-Length'] = cl;

    return new Response(response.body, { status: response.status, headers });
  } catch (err) {
    console.error('[YT-Proxy] Relay error for', videoId, err.message);
    return c.text('Stream relay failed: ' + err.message, 500);
  }
});

// ── Resolve track ──
app.get('/resolve', async (c) => {
  const q = c.req.query('q');
  if (!q?.trim()) return c.json({ error: 'Missing query' }, 400);

  try {
    const videoId = extractVideoId(q.trim());
    if (videoId) {
      const yt = await getInnertube();
      const info = await yt.getInfo(videoId);
      const v = info.basic_info ?? {};
      const rawTitle = String(v.title?.text ?? v.title ?? 'Unknown');
      const channelName = v.channel?.name?.text ?? v.channel?.name ?? 'Unknown';
      const durObj = v.duration ?? {};
      const dur = typeof durObj === 'number' ? durObj : (durObj?.seconds ?? parseYTDuration(durObj?.text ?? durObj ?? ''));
      const thumb = v.thumbnail?.[0]?.url ?? v.thumbnail?.url ?? '';
      return c.json({
        id: videoId, title: rawTitle.replace(/\s*\[.*?\]\s*/g, ' ').trim(),
        artist: channelName, duration: dur, thumbnail: thumb,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }

    const yt = await getInnertube();
    const results = await yt.search(q.trim(), { type: 'video' });
    if (!results?.videos?.length) return c.json({ error: 'No results' }, 404);

    const v = results.videos[0];
    const durObj = v.duration ?? {};
    const dur = typeof durObj === 'number' ? durObj : (durObj?.seconds ?? parseYTDuration(durObj?.text ?? durObj ?? ''));
    return c.json({
      id: v.id,
      title: String(v.title?.text ?? v.title ?? '').replace(/\s*\[.*?\]\s*/g, ' ').trim(),
      artist: v.channel?.name?.text ?? v.channel?.name ?? 'Unknown',
      duration: dur,
      thumbnail: v.thumbnails?.[0]?.url ?? v.thumbnail?.url ?? v.thumbnail ?? '',
      videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
    });
  } catch (err) {
    console.error('[YT-Proxy] Resolve error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Helpers ──
function parseYTDuration(iso) {
  if (!iso) return 0;
  const s = String(iso);
  if (!s.startsWith('PT')) return 0;
  let seconds = 0;
  const h = s.match(/(\d+)H/);
  const m = s.match(/(\d+)M/);
  const sec = s.match(/(\d+)S/);
  if (h) seconds += parseInt(h[1], 10) * 3600;
  if (m) seconds += parseInt(m[1], 10) * 60;
  if (sec) seconds += parseInt(sec[1], 10);
  return seconds;
}

function extractVideoId(input) {
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

const PORT = 3010;
console.log(`[YT-Proxy] Starting on port ${PORT}`);

Bun.serve({
  port: PORT,
  fetch: app.fetch,
});
