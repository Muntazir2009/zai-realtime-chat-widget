import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
    },
  });
}

const server = Bun.serve({
  port: 3010,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
      }});
    }

    // Health check
    if (path === '/health') {
      return jsonResponse({ status: 'ok', uptime: process.uptime() });
    }

    // Search
    if (path === '/search') {
      const q = url.searchParams.get('q');
      if (!q?.trim()) return jsonResponse({ error: 'Missing query' }, 400);

      try {
        const result = execSync(
          `node "${join(__dirname, 'search-worker.mjs')}" search "${q.replace(/"/g, '\\"')}"`,
          { timeout: 30000, encoding: 'utf8' }
        );
        return jsonResponse(JSON.parse(result));
      } catch (err) {
        const errorMsg = err.stderr?.toString() || err.message;
        console.error('[YT-Proxy] Search error:', errorMsg);
        return jsonResponse({ error: errorMsg.substring(0, 200) }, 500);
      }
    }

    // Resolve
    if (path === '/resolve') {
      const q = url.searchParams.get('q');
      if (!q?.trim()) return jsonResponse({ error: 'Missing query' }, 400);

      try {
        const result = execSync(
          `node "${join(__dirname, 'search-worker.mjs')}" resolve "${q.replace(/"/g, '\\"')}"`,
          { timeout: 30000, encoding: 'utf8' }
        );
        return jsonResponse(JSON.parse(result));
      } catch (err) {
        const errorMsg = err.stderr?.toString() || err.message;
        console.error('[YT-Proxy] Resolve error:', errorMsg);
        return jsonResponse({ error: errorMsg.substring(0, 200) }, 500);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
});

console.log(`[YT-Proxy] Server running at http://localhost:3010`);
