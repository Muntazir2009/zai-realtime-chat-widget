// ── Global error handlers ──
process.on('uncaughtException', (err) => {
  console.error('[YT-Proxy] UNCAUGHT:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[YT-Proxy] UNHANDLED:', reason);
});

// ── Lazy Innertube singleton (fully dynamic import) ──
let _innertube: any = null;
let _initPromise: Promise<any> | null = null;

async function getInnertube() {
  if (_innertube) return _innertube;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      console.log('[YT-Proxy] Dynamically importing youtubei.js...');
      const { Innertube } = await import('youtubei.js');
      console.log('[YT-Proxy] Creating Innertube...');
      _innertube = await Innertube.create({ generate_session_locally: true });
      console.log('[YT-Proxy] Innertube ready!');
      return _innertube;
    } catch (err) {
      _initPromise = null;
      console.error('[YT-Proxy] Init failed:', err);
      throw err;
    }
  })();
  return _initPromise;
}

// ── CORS helper ──
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
  };
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ── Start server ──
const PORT = 3010;
console.log(`[YT-Proxy] Starting on port ${PORT}`);

Bun.serve({
  port: PORT,
  fetch: async (req) => {
    try {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // CORS preflight
      if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      // Health check (no innertube needed)
      if (path === '/health') {
        return jsonResponse({
          status: 'ok',
          innertube: _innertube ? 'ready' : 'not_init',
          uptime: process.uptime(),
        });
      }

      // ── Search ──
      if (path === '/search') {
        const q = url.searchParams.get('q');
        if (!q?.trim()) return jsonResponse({ error: 'Missing query' }, 400);

        try {
          const yt = await getInnertube();
          const results = await yt.search(q.trim(), { type: 'video' });

          const tracks = (results?.videos ?? [])
            .filter((v: any) => v.type === 'Video' && v.id && v.title)
            .slice(0, 15)
            .map((v: any) => ({
              id: v.id,
              title: String(v.title?.text ?? v.title ?? '').replace(/\s*\[.*?\]\s*/g, ' ').trim(),
              artist: v.channel?.name?.text ?? v.channel?.name ?? 'Unknown',
              duration: typeof v.duration === 'number' ? v.duration : (v.duration?.seconds ?? 0),
              thumbnail: v.thumbnails?.[0]?.url ?? '',
              videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
            }));

          console.log(`[YT-Proxy] Found ${tracks.length} tracks for "${q.trim()}"`);
          return jsonResponse({ tracks });
        } catch (err: any) {
          console.error('[YT-Proxy] Search error:', err.message);
          return jsonResponse({ error: err.message }, 500);
        }
      }

      // ── Resolve ──
      if (path === '/resolve') {
        const q = url.searchParams.get('q');
        if (!q?.trim()) return jsonResponse({ error: 'Missing query' }, 400);

        try {
          const yt = await getInnertube();
          const videoId = extractVideoId(q.trim());

          if (videoId) {
            const info = await yt.getInfo(videoId);
            const v = info.basic_info ?? {};
            return jsonResponse({
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
          if (!v) return jsonResponse({ error: 'No results' }, 404);

          return jsonResponse({
            id: v.id,
            title: String(v.title?.text ?? v.title ?? '').replace(/\s*\[.*?\]\s*/g, ' ').trim(),
            artist: v.channel?.name?.text ?? v.channel?.name ?? 'Unknown',
            duration: typeof v.duration === 'number' ? v.duration : (v.duration?.seconds ?? 0),
            thumbnail: v.thumbnails?.[0]?.url ?? '',
            videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
          });
        } catch (err: any) {
          console.error('[YT-Proxy] Resolve error:', err.message);
          return jsonResponse({ error: err.message }, 500);
        }
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err: any) {
      console.error('[YT-Proxy] Top-level error:', err.message);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },
});

console.log(`[YT-Proxy] Server running at http://localhost:${PORT}`);

function extractVideoId(input: string): string | null {
  const m = input.trim().match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : (/^([a-zA-Z0-9_-]{11})$/.test(input.trim()) ? input.trim() : null);
}
