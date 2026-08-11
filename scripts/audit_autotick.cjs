#!/usr/bin/env node
// Scan hour 18 raw archive: find repos where regro-cf-autotick-bot is actor or owner
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

const HOUR = '2026-08-11-18';
const TARGET = 'regro-cf-autotick-bot';
const stats = new Map(); // repo -> {pushes, events, actors:Set}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'pulse-audit' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); res.resume(); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  const buf = await get(`https://data.gharchive.org/${HOUR}.json.gz`);
  console.log(`got ${(buf.length / 1048576).toFixed(1)} MB`);
  const gunzip = zlib.createGunzip();
  gunzip.end(buf);
  const rl = readline.createInterface({ input: gunzip });
  let checked = 0;
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let e; try { e = JSON.parse(line); } catch { return; }
    if (!e || !e.repo || !e.repo.name) return;
    const actor = e.actor ? e.actor.login : '';
    const owner = e.repo.name.split('/')[0];
    if (actor.toLowerCase() !== TARGET && owner.toLowerCase() !== TARGET) return;
    checked++;
    let st = stats.get(e.repo.name);
    if (!st) { st = { pushes: 0, events: 0, actors: new Set(), types: new Set() }; stats.set(e.repo.name, st); }
    st.events++;
    if (e.type === 'PushEvent') st.pushes++;
    if (actor) st.actors.add(actor);
    st.types.add(e.type);
  });
  rl.on('close', () => {
    console.log('repos involving', TARGET + ':', stats.size, '| events touching it:', checked);
    for (const [repo, st] of [...stats.entries()].sort((a, b) => b[1].events - a[1].events).slice(0, 25)) {
      console.log(repo.padEnd(55), 'events=' + st.events, 'pushes=' + st.pushes, 'actors=' + [...st.actors].join(','), 'types=' + [...st.types].join(','));
    }
  });
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
