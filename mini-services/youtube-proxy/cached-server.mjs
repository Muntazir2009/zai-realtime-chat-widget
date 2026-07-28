import { createServer } from 'http';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, '.search-cache.json');
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

function doSearch(query) {
  try {
    const result = execSync(
      `node "${join(__dirname, 'search-worker.mjs')}" search "${query.replace(/"/g, '\\"')}"`,
      { timeout: 30000, encoding: 'utf8', cwd: __dirname }
    );
    return JSON.parse(result);
  } catch (err) {
    console.error('Search failed:', err.message?.substring(0, 100));
    return { tracks: [] };
  }
}

function saveCache() {
  try {
    const obj = {};
    for (const [k, v] of cache) obj[k] = v;
    writeFileSync(CACHE_FILE, JSON.stringify(obj));
  } catch {}
}

function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) cache.set(k, v);
      console.log(`[YT-Proxy] Loaded ${cache.size} cached queries`);
    }
  } catch {}
}

// Load existing cache
loadCache();

// Pre-warm some popular queries if cache is empty
if (cache.size === 0) {
  const popular = ['hello', 'music', 'top hits', 'trending', 'pop', 'rock', 'lofi', 'edm'];
  console.log(`[YT-Proxy] Pre-warming ${popular.length} queries...`);
  for (const q of popular) {
    const result = doSearch(q);
    if (result.tracks?.length) {
      cache.set(q, result);
      console.log(`  "${q}": ${result.tracks.length} tracks`);
    }
  }
  saveCache();
  console.log('[YT-Proxy] Cache warmed');
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
    const q = url.searchParams.get('q')?.trim().toLowerCase();
    if (!q) return sendJson(res, { error: 'Missing query' }, 400);

    // Exact match
    if (cache.has(q)) {
      return sendJson(res, cache.get(q));
    }

    // Partial match on keys
    for (const [key, val] of cache) {
      if (key.includes(q) || q.includes(key)) {
        return sendJson(res, val);
      }
    }

    // No match — try live search (might crash, but we tried)
    console.log(`[YT-Proxy] Cache miss for "${q}", doing live search...`);
    const result = doSearch(q);
    if (result.tracks?.length) {
      cache.set(q, result);
      saveCache();
    }
    return sendJson(res, result);
  }

  if (path === '/resolve') {
    const q = url.searchParams.get('q')?.trim();
    if (!q) return sendJson(res, { error: 'Missing query' }, 400);
    const result = doSearch(`resolve:${q}`);
    return sendJson(res, result);
  }

  sendJson(res, { error: 'Not found' }, 404);
});

server.listen(3010, () => {
  console.log(`[YT-Proxy] Cached server running at http://localhost:3010 (${cache.size} queries cached)`);
});
