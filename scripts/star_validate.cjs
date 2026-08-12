// validate v5.2 star-bomb radar thresholds against historic suspect hours
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');
const fs = require('fs');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

const SHARED_BOTS = new Set(['github-actions[bot]', 'dependabot[bot]', 'renovate[bot]']);
const isSharedBot = (a) => SHARED_BOTS.has(a) || /\[bot\]$/.test(a);

async function analyze(hourLabel) {
  const url = `https://data.gharchive.org/${hourLabel}.json.gz`;
  console.log(`\n=== hour ${hourLabel} ===`);
  const buf = await get(url);
  const gunzip = zlib.createGunzip();
  gunzip.end(buf);
  const rl = readline.createInterface({ input: gunzip });
  const repos = new Map();
  const actors = new Map();
  let events = 0;
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let e; try { e = JSON.parse(line); } catch { return; }
    if (!e || !e.repo || !e.repo.name) return;
    events++;
    const name = e.repo.name;
    let r = repos.get(name);
    if (!r) { r = { repo: name, stars: 0, forks: 0, issues: 0, prs: 0, releases: 0, pushes: 0, reviews: 0, actors: 0, _starActors: new Set() }; repos.set(name, r); }
    const a = e.actor ? (e.actor.login || '') : '';
    switch (e.type) {
      case 'WatchEvent': r.stars++; if (a) r._starActors.add(a); break;
      case 'ForkEvent': r.forks++; break;
      case 'IssuesEvent': r.issues++; break;
      case 'PullRequestEvent': r.prs++; break;
      case 'ReleaseEvent': r.releases++; break;
      case 'PushEvent': r.pushes++; break;
      case 'PullRequestReviewEvent': case 'PullRequestReviewCommentEvent':
      case 'IssueCommentEvent': case 'CommitCommentEvent': r.reviews++; break;
    }
    if (a) {
      let ac = actors.get(a);
      if (!ac) { ac = { events: 0, nonWatch: 0, starRepos: new Set() }; actors.set(a, ac); }
      ac.events++;
      if (e.type === 'WatchEvent') ac.starRepos.add(name); else ac.nonWatch++;
    }
  });
  await new Promise((res) => {
    rl.on('close', res);
    rl.on('error', res);
  });

  const bareRepos = new Set();
  for (const r of repos.values()) {
    if ((r.stars || 0) >= 3 && !(r.pushes || 0) && !(r.prs || 0) && !(r.issues || 0) && !(r.releases || 0) && !(r.reviews || 0)) bareRepos.add(r.repo);
  }
  const watchOnly = new Set();
  let pureCheck = 0;
  for (const [name, ac] of actors.entries()) { if (ac.events > 0 && ac.nonWatch === 0) { watchOnly.add(name); pureCheck++; } }
  console.log(`[dbg] actors=${actors.size} pureWatchers=${pureCheck}`);
  const coStar = new Set();
  for (const [name, ac] of actors.entries()) {
    if (ac.events > 0 && ac.nonWatch === 0) {
      let n = 0;
      for (const rn of ac.starRepos) if (bareRepos.has(rn)) n++;
      if (n >= 2) coStar.add(name);
    }
  }
  console.log(`events=${events} repos=${repos.size} bare(>=3★,zero-else)=${bareRepos.size} watchOnly=${watchOnly.size} coStar=${coStar.size}`);

  // all star-only candidates sorted
  const cands = [];
  for (const r of repos.values()) {
    if (!bareRepos.has(r.repo)) continue;
    const starOnlyCount = [...r._starActors].filter((a) => watchOnly.has(a) && !isSharedBot(a)).length;
    const coStarCount = [...r._starActors].filter((a) => coStar.has(a) && !isSharedBot(a)).length;
    if (starOnlyCount >= 3) cands.push({ repo: r.repo, stars: r.stars, events: r.events, starOnlyCount, coStarCount, watchers: r._starActors.size });
  }
  cands.sort((a, b) => b.stars - a.stars);
  console.log('star-only candidates (>=3 lurker★):', cands.length);
  for (const c of cands.slice(0, 15)) console.log(`  ${c.repo}  ${c.stars}★ events=${c.events} lurker★=${c.starOnlyCount} coStar=${c.coStarCount} watchers=${c.watchers}`);
  // coStar members detail
  const coStarRepos = new Map();
  for (const ac of actors.values()) {
    if (ac.events > 0 && ac.nonWatch === 0) {
      const bareStarred = [...ac.starRepos].filter((rn) => bareRepos.has(rn));
      if (bareStarred.length >= 2) coStarRepos.set(ac.actor, bareStarred);
    }
  }
  if (coStarRepos.size) {
    console.log('co-star clusters:', coStarRepos.size);
    let i = 0;
    for (const [act, rs] of coStarRepos) { if (i++ >= 8) break; console.log(`  ${act}: ${rs.join(', ')}`); }
  }
}

(async () => {
  await analyze('2026-08-12-5');   // spinabot/brigade hour
  await analyze('2026-08-12-15');  // guillaumemeyer/watermarks-remover hour
})().catch((e) => { console.error(e.message); process.exit(1); });
