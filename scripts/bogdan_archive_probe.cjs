// bogdan_archive_probe.cjs — count bogdanstancu1119-maker event types in 2026-08-17-3 archive
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const file = '/tmp/gh3.json.gz';
const out = fs.createWriteStream('/tmp/gh3.json');
zlib.createGunzip().on('error', e => { console.error('gunzip err', e.message); process.exit(1); })
  .pipe(fs.createReadStream(file)).pipe(out).on('close', run);

function run() {
  const rl = readline.createInterface({ input: fs.createReadStream('/tmp/gh3.json'), crlfDelay: Infinity });
  const byType = {};
  const byRepo = {};
  let total = 0, actorTotal = 0, otherPush = 0;
  rl.on('line', (line) => {
    total++;
    if (!line.includes('bogdanstancu1119-maker')) return;
    let e;
    try { e = JSON.parse(line); } catch { return; }
    const actor = (e.actor && e.actor.login) || '';
    if (actor !== 'bogdanstancu1119-maker') return;
    actorTotal++;
    const t = e.type;
    byType[t] = (byType[t] || 0) + 1;
    const repo = e.repo && e.repo.name;
    if (repo) byRepo[repo] = (byRepo[repo] || 0) + 1;
  });
  rl.on('close', () => {
    console.log('total events in hour:', total);
    console.log('actor events:', actorTotal);
    console.log('by type:', JSON.stringify(byType, null, 1));
    console.log('by repo (top 15):');
    Object.entries(byRepo).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([r, n]) => console.log('  ', r, n));
  });
}
