// debug: count WatchEvents and pure-watcher actors in a given hour
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function main(hourLabel) {
  const buf = await get(`https://data.gharchive.org/${hourLabel}.json.gz`);
  const gunzip = zlib.createGunzip();
  gunzip.end(buf);
  const rl = readline.createInterface({ input: gunzip });
  let watch = 0, push = 0, total = 0, watchActors = new Map(), allActors = new Map();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let e; try { e = JSON.parse(line); } catch { return; }
    if (!e || !e.repo || !e.repo.name) return;
    total++;
    const a = e.actor ? (e.actor.login || '') : '';
    if (e.type === 'WatchEvent') {
      watch++;
      if (a) watchActors.set(a, (watchActors.get(a) || 0) + 1);
    } else if (e.type === 'PushEvent') push++;
    if (a) allActors.set(a, (allActors.get(a) || 0) + 1);
  });
  await new Promise((res) => rl.on('close', res));
  let pureWatchers = 0;
  for (const [a] of watchActors) if (!allActors.has(a)) pureWatchers++;
  // hmm — allActors includes watch actors too (I set both). Redo properly:
  pureWatchers = 0;
  const withOther = new Set();
  // need per-actor type breakdown
  // (simplify: rerun below)
  console.log(`${hourLabel}: total=${total} WatchEvent=${watch} PushEvent=${push} distinctWatchActors=${watchActors.size}`);
  // proper per-actor: track nonWatch via a second pass is wasteful; approximate:
  // actors whose watch count == their total count
  let both = 0, onlyWatch = 0;
  for (const [a, n] of watchActors) {
    const t = allActors.get(a) || 0;
    if (t === n) onlyWatch++; else both++;
  }
  console.log(`  watcher actors: only-watch=${onlyWatch} watch+other=${both}`);
}
main(process.argv[2]).catch((e) => { console.error(e.message); process.exit(1); });
