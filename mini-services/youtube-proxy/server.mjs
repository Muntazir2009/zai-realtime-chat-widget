import { spawn } from 'child_process';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
  });
  res.end(JSON.stringify(data));
}

function runWorker(action, query) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [
      join(__dirname, 'search-worker.mjs'),
      action,
      query,
    ], {
      timeout: 45000,
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code === 0 && stdout) {
        try { resolve(JSON.parse(stdout)); }
        catch { resolve({ tracks: [] }); }
      } else {
        reject(new Error(stderr || `exit ${code}`));
      }
    });
    child.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS preflight
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
    return sendJson(res, { status: 'ok', uptime: process.uptime() });
  }

  if (path === '/search') {
    const q = url.searchParams.get('q');
    if (!q?.trim()) return sendJson(res, { error: 'Missing query' }, 400);
    try {
      console.log(`[YT-Proxy] Searching: "${q.trim()}"`);
      const result = await runWorker('search', q.trim());
      console.log(`[YT-Proxy] Found ${result.tracks?.length ?? 0} tracks`);
      return sendJson(res, result);
    } catch (err) {
      console.error('[YT-Proxy] Search error:', err.message);
      return sendJson(res, { error: err.message.substring(0, 200) }, 500);
    }
  }

  if (path === '/resolve') {
    const q = url.searchParams.get('q');
    if (!q?.trim()) return sendJson(res, { error: 'Missing query' }, 400);
    try {
      console.log(`[YT-Proxy] Resolving: "${q.trim()}"`);
      const result = await runWorker('resolve', q.trim());
      return sendJson(res, result);
    } catch (err) {
      console.error('[YT-Proxy] Resolve error:', err.message);
      return sendJson(res, { error: err.message.substring(0, 200) }, 500);
    }
  }

  sendJson(res, { error: 'Not found' }, 404);
});

server.listen(3010, () => {
  console.log(`[YT-Proxy] Server running at http://localhost:3010`);
});
