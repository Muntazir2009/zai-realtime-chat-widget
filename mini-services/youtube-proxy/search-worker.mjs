import { Innertube } from 'youtubei.js';

const action = process.argv[2];
const query = process.argv[3];

if (!action || !query) {
  process.stderr.write('Usage: node search-worker.mjs <search|resolve> <query>\n');
  process.exit(1);
}

try {
  const yt = await Innertube.create({ generate_session_locally: true });

  if (action === 'search') {
    const results = await yt.search(query, { type: 'video' });
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
    process.stdout.write(JSON.stringify({ tracks }));
  } else if (action === 'resolve') {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    let videoId = null;
    for (const p of patterns) {
      const m = query.trim().match(p);
      if (m) { videoId = m[1]; break; }
    }

    if (videoId) {
      const info = await yt.getInfo(videoId);
      const v = info.basic_info ?? {};
      process.stdout.write(JSON.stringify({
        id: videoId,
        title: String(v.title?.text ?? v.title ?? 'Unknown').replace(/\s*\[.*?\]\s*/g, ' ').trim(),
        artist: v.channel?.name?.text ?? v.channel?.name ?? 'Unknown',
        duration: typeof v.duration === 'number' ? v.duration : (v.duration?.seconds ?? 0),
        thumbnail: v.thumbnail?.[0]?.url ?? '',
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      }));
    } else {
      const results = await yt.search(query, { type: 'video' });
      const v = results?.videos?.[0];
      if (!v) {
        process.stderr.write('No results');
        process.exit(1);
      }
      process.stdout.write(JSON.stringify({
        id: v.id,
        title: String(v.title?.text ?? v.title ?? '').replace(/\s*\[.*?\]\s*/g, ' ').trim(),
        artist: v.channel?.name?.text ?? v.channel?.name ?? 'Unknown',
        duration: typeof v.duration === 'number' ? v.duration : (v.duration?.seconds ?? 0),
        thumbnail: v.thumbnails?.[0]?.url ?? '',
        videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
      }));
    }
  }
} catch (err) {
  process.stderr.write(err.message);
  process.exit(1);
}
