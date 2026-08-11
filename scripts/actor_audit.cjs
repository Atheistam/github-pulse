#!/usr/bin/env node
// Actor audit: who pushes to farm repos? Do actors repeat across farm repos?
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

const FARM_REPOS = [
  'conleyricky202/babjhl', 'cookronald543/xltxlb', 'cory26cock/toaeba',
  'warrenmichael6536/fgsdwo', 'vargaszachary920/dymxbj', 'ppfdalerts/ppfd-alerts',
  'owenswhitney9429/wcpxhf', 'frace8bestansweb/oypdkl', 'mercerkevin8547/vgajej',
];
const actorRepos = new Map(); // actor -> Set(repos)

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'pulse-farm-audit' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); res.resume(); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  const buf = await get('https://data.gharchive.org/2026-08-11-15.json.gz');
  const gunzip = zlib.createGunzip();
  gunzip.end(buf);
  const rl = readline.createInterface({ input: gunzip });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let e; try { e = JSON.parse(line); } catch { return; }
    if (!e || !e.repo || !e.repo.name) return;
    if (!FARM_REPOS.includes(e.repo.name)) return;
    const a = e.actor ? e.actor.login : '?';
    if (!actorRepos.has(a)) actorRepos.set(a, new Set());
    actorRepos.get(a).add(e.repo.name);
  });
  rl.on('close', () => {
    console.log('actors → repos (this hour):');
    for (const [a, repos] of actorRepos) {
      console.log(`${a.padEnd(30)} ${repos.size} repo(s): ${[...repos].join(', ')}`);
    }
  });
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
