#!/usr/bin/env node
// Precise counts: auto-gen names vs zero-human at different thresholds.
const zlib = require('zlib'), https = require('https'), readline = require('readline');
function get(url) { return new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'p' } }, (r) => { if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode)); const c = []; r.on('data', (x) => c.push(x)); r.on('end', () => res(Buffer.concat(c))); }).on('error', rej)); }
const AUTONAME_OWNER = /^[a-z]+[0-9]{2,}[a-z]*$/;
const AUTONAME_REPO = /^[a-z]{4,8}$/;
const isAuto = (repo) => { const [o = '', r = ''] = String(repo).toLowerCase().split('/'); return AUTONAME_OWNER.test(o) && AUTONAME_REPO.test(r); };
(async () => {
  const buf = await get('https://data.gharchive.org/2026-08-11-15.json.gz');
  const gz = zlib.createGunzip(); gz.end(buf);
  const rl = readline.createInterface({ input: gz });
  const repos = new Map();
  rl.on('line', (l) => {
    if (!l.trim()) return;
    let e; try { e = JSON.parse(l); } catch { return; }
    if (!e || !e.repo || !e.repo.name) return;
    const n = e.repo.name;
    let r = repos.get(n);
    if (!r) { r = { repo: n, pushes: 0, human: 0, actors: new Set() }; repos.set(n, r); }
    if (e.type === 'PushEvent') r.pushes++;
    if (['PullRequestEvent', 'IssuesEvent', 'WatchEvent', 'ForkEvent', 'ReleaseEvent', 'PullRequestReviewEvent', 'PullRequestReviewCommentEvent', 'IssueCommentEvent', 'CommitCommentEvent'].includes(e.type)) r.human++;
    if (e.actor && e.actor.login) r.actors.add(e.actor.login);
  });
  rl.on('close', () => {
    let auto5 = 0, auto10 = 0, zh10 = 0, zh25 = 0;
    for (const r of repos.values()) {
      const a = isAuto(r.repo);
      const zh = r.human === 0;
      const lo = r.actors.size <= 2;
      if (a && zh && lo && r.pushes >= 5) auto5++;
      if (a && zh && lo && r.pushes >= 10) auto10++;
      if (zh && lo && r.pushes >= 10) zh10++;
      if (zh && lo && r.pushes >= 25) zh25++;
    }
    console.log('total repos:', repos.size);
    console.log('auto-gen + zero-human + <=2 actors, pushes>=5 :', auto5);
    console.log('auto-gen + zero-human + <=2 actors, pushes>=10:', auto10);
    console.log('zero-human + <=2 actors, pushes>=10 (any name) :', zh10);
    console.log('zero-human + <=2 actors, pushes>=25 (any name) :', zh25);
  });
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
