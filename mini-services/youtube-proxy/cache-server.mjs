import { createServer } from 'http';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cache = new Map();

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
  });
  res.end(JSON.stringify(data));
}

function searchDirect(query) {
  try {
    const result = execSync(
      `node "${join(__dirname, 'search-worker.mjs')}" search "${query.replace(/"/g, '\\"')}"`,
      { timeout: 30000, encoding: 'utf8', cwd: __dirname }
    );
    return JSON.parse(result);
  } catch (err) {
    return { tracks: [], error: err.stderr?.toString() || err.message };
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
    });
    res.end();
    return;
  }

  if (path === '/health') {
    return sendJson(res, { status: 'ok', cacheSize: cache.size, uptime: process.uptime() });
  }

  if (path === '/search') {
    const q = url.searchParams.get('q')?.trim();
    if (!q) return sendJson(res, { error: 'Missing query' }, 400);

    // Check cache
    const cached = cache.get(q.toLowerCase());
    if (cached) {
      console.log(`[Cache] Hit: "${q}"`);
      return sendJson(res, cached);
    }

    // Sync search (execSync, this blocks but that's OK)
    console.log(`[Cache] Miss, searching: "${q}"`);
    const result = searchDirect(q);
    
    // Cache the result
    if (result.tracks?.length) {
      cache.set(q.toLowerCase(), result);
      // Keep cache manageable
      if (cache.size > 100) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
    }

    return sendJson(res, result);
  }

  if (path === '/resolve') {
    const q = url.searchParams.get('q')?.trim();
    if (!q) return sendJson(res, { error: 'Missing query' }, 400);
    
    const result = searchDirect(`resolve:${q}`);
    return sendJson(res, result);
  }

  sendJson(res, { error: 'Not found' }, 404);
});

server.listen(3010, () => {
  console.log(`[YT-Cache] Server running at http://localhost:3010`);
});
