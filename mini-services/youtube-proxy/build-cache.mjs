import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cache = {};

const queries = [
  'hello', 'adele', 'drake', 'taylor swift', 'billie eilish', 'ed sheeran',
  'the weeknd', 'imagine dragons', 'eminem', 'rihanna', 'coldplay', 'bruno mars',
  'ariana grande', 'dua lipa', 'harry styles', 'lofi beats', 'chill music',
  'workout music', 'sad songs', 'love songs', 'rap hits', 'hip hop', 'rock',
  'pop music', 'trending music', 'kpop', 'anime songs', 'gaming music',
  'electronic music', 'piano music', 'acoustic covers', 'country music',
  'jazz music', 'classical music', 'ambient music', 'house music', 'techno music',
  'reggae music', 'metal music', 'indie music', 'remix', 'top hits', 'new music',
];

for (const q of queries) {
  try {
    const escaped = q.replace(/"/g, '\\"');
    const cmd = `node "${join(__dirname, 'search-worker.mjs')}" search "${escaped}"`;
    const result = execSync(cmd, { timeout: 20000, encoding: 'utf8' });
    const data = JSON.parse(result);
    if (data.tracks && data.tracks.length > 0) {
      cache[q] = data;
      process.stdout.write('.');
    } else {
      process.stdout.write('e');
    }
  } catch (err) {
    process.stdout.write('x');
  }
}

const outPath = join(__dirname, '..', 'static-search-cache.json');
writeFileSync(outPath, JSON.stringify(cache, null, 0));
console.log(`\nCached ${Object.keys(cache).length}/${queries.length} queries`);
