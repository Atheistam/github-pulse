#!/usr/bin/env node
// Ground-truth check: pull hour 15 archive, examine push timing for suspected farm repos.
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

const HOUR = '2026-08-11-15';
const TARGETS = new Set([
  'conleyricky202/babjhl', 'cookronald543/xltxlb', 'cory26cock/toaeba',
  'warrenmichael6536/fgsdwo', 'vargaszachary920/dymxbj', 'ppfdalerts/ppfd-alerts',
  'owenswhitney9429/wcpxhf', 'frace8bestansweb/oypdkl', 'mercerkevin8547/vgajej',
  'PostHog/posthog', 'SAPTARSHI-coder/EaseMotion-css', 'n8n-io/n8n',
  'LiamBruhin/SillyStuff', 'technion-histograms', 'tenstorrent/tt-metal',
]);
const pushes = new Map(); // repo -> [{ts, actor}]
const allEvents = new Map(); // repo -> count

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
  const url = `https://data.gharchive.org/${HOUR}.json.gz`;
  console.log('downloading', url);
  const buf = await get(url);
  console.log(`got ${(buf.length / 1048576).toFixed(1)} MB`);
  const gunzip = zlib.createGunzip();
  gunzip.end(buf);
  const rl = readline.createInterface({ input: gunzip });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let e; try { e = JSON.parse(line); } catch { return; }
    if (!e || !e.repo || !e.repo.name) return;
    const name = e.repo.name;
    if (!TARGETS.has(name)) return;
    allEvents.set(name, (allEvents.get(name) || 0) + 1);
    if (e.type === 'PushEvent') {
      if (!pushes.has(name)) pushes.set(name, []);
      pushes.get(name).push({ ts: Date.parse(e.created_at), actor: e.actor ? e.actor.login : '?' });
    }
  });
  rl.on('close', () => {
    for (const [repo, arr] of pushes) {
      arr.sort((a, b) => a.ts - b.ts);
      const spanMin = (arr[arr.length - 1].ts - arr[0].ts) / 60000;
      const actors = new Set(arr.map((p) => p.actor)).size;
      // burst: max pushes in any 60s window
      let maxPerMin = 0;
      for (let i = 0; i < arr.length; i++) {
        let j = i;
        while (j < arr.length && arr[j].ts - arr[i].ts < 60000) j++;
        maxPerMin = Math.max(maxPerMin, j - i);
      }
      console.log(`${repo.padEnd(42)} pushes=${String(arr.length).padStart(3)} span=${spanMin.toFixed(1).padStart(6)}m actors=${actors} max60s=${maxPerMin}`);
    }
    console.log('--- non-push event counts ---');
    for (const [repo, n] of allEvents) {
      if (!pushes.has(repo)) console.log(`${repo.padEnd(42)} events=${n} (no pushes)`);
    }
  });
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
