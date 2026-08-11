#!/usr/bin/env node
/**
 * GitHub Pulse — pipeline
 * Fetches the latest complete GH Archive hour, aggregates GitHub activity,
 * and writes a snapshot + rolling history for the static site.
 *
 * Snapshot schema (written to site/data/snapshot.json):
 * {
 *   "as_of": "2026-08-11T02:00:00Z",        // hour covered (start)
 *   "hour": "2026-08-11-0",
 *   "events": 123456,
 *   "repos_seen": 12345,
 *   "top_gainers": [{repo, stars, forks, language, url}...],   // stars+forks this hour
 *   "top_active":  [{repo, events, language, url}...],         // any event count
 *   "top_languages": [{language, stars, forks, events}...],
 *   "new_repos": [{repo, stars, language, url, desc}...],      // created this hour, sorted by stars
 *   "top_releases": [{repo, release, tag, desc, url}...]
 * }
 */
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SITE_DATA = path.join(__dirname, '..', 'site', 'data');
const HIST_DIR = path.join(SITE_DATA, 'history');

function pad(n) { return String(n).padStart(2, '0'); }

function dateStrUTC(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Probe availability of an archive file; returns true if HTTP 200/206 */
function probeExists(hourLabel) {
  return new Promise((resolve) => {
    const req = https.request(`https://data.gharchive.org/${hourLabel}.json.gz`, { method: 'HEAD' }, (res) => {
      res.resume();
      resolve([200, 206].includes(res.statusCode));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(12000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/** Find the most recent complete hour file (file for hour H exists ⇒ hour H finished) */
async function findLatestHour() {
  const now = new Date();
  // The file for hour H (UTC) is published shortly after H ends. Try today, then go back.
  for (let back = 0; back < 3; back++) {
    const d = new Date(now.getTime() - back * 86400000);
    const ds = dateStrUTC(d);
    // start from the hour before current UTC hour (current one is incomplete)
    let h = d.getUTCHours() - 1;
    if (back === 0 && h < 0) { h = 23; }
    for (let i = h; i >= 0; i--) {
      const label = `${ds}-${i}`;
      if (await probeExists(label)) return label;
    }
  }
  throw new Error('No recent GH Archive file found');
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = {
      headers: Object.assign({
        'User-Agent': 'github-pulse-bot/1.0',
        'Accept': 'application/vnd.github+json',
      }, headers),
    };
    mod.get(url, opts, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function processHour(hourLabel, localFile) {
  return new Promise((resolve, reject) => {
    const url = `https://data.gharchive.org/${hourLabel}.json.gz`;
    const useLocal = localFile && fs.existsSync(localFile);
    console.log(`[pulse] ${useLocal ? 'using local' : 'downloading'} ${url} ...`);
    const src = useLocal
      ? Promise.resolve(fs.readFileSync(localFile))
      : get(url);
    src.then((buf) => {
      console.log(`[pulse] got ${(buf.length / 1048576).toFixed(1)} MB compressed`);
      const gunzip = zlib.createGunzip();
      gunzip.end(buf);
      const readline = require('readline');
      const rl = readline.createInterface({ input: gunzip });

      const repos = new Map(); // full_name -> agg
      const langs = new Map();
      const newRepos = [];
      const releases = [];
      let events = 0, parsed = 0;

      rl.on('line', (line) => {
        if (!line.trim()) return;
        parsed++;
        let e;
        try { e = JSON.parse(line); } catch { return; }
        if (!e || !e.repo || !e.repo.name) return;
        events++;
        const name = e.repo.name;
        let r = repos.get(name);
        if (!r) {
          r = { repo: name, stars: 0, forks: 0, issues: 0, prs: 0, releases: 0, pushes: 0, events: 0, language: null, created: false, desc: null, url: `https://github.com/${name}` };
          repos.set(name, r);
        }
        r.events++;
        const a = e.actor ? (e.actor.login || '') : '';
        switch (e.type) {
          case 'WatchEvent': r.stars++; break;
          case 'ForkEvent': r.forks++; break;
          case 'IssuesEvent': r.issues++; break;
          case 'PullRequestEvent': r.prs++; break;
          case 'ReleaseEvent':
            r.releases++;
            releases.push({ repo: name, release: (e.payload && e.payload.release && e.payload.release.name) || (e.payload && e.payload.release && e.payload.release.tag_name) || 'release', tag: e.payload && e.payload.release && e.payload.release.tag_name, desc: (e.payload && e.payload.release && e.payload.release.body || '').slice(0, 160), url: `https://github.com/${name}/releases`, actor: a });
            break;
          case 'PushEvent': r.pushes++; break;
          case 'CreateEvent':
            if (e.payload && e.payload.ref_type === 'repository') r.created = true;
            break;
        }
        if (e.repo.language && e.repo.language !== 'null') r.language = e.repo.language;
        if (e.payload && e.payload.description && !r.desc) r.desc = String(e.payload.description).slice(0, 200);
        if (e.type === 'CreateEvent' && e.payload && e.payload.ref_type === 'repository') {
          newRepos.push({ repo: name, stars: 0, language: e.repo.language, desc: r.desc, url: r.url, actor: a });
        }
        if (e.repo.language && e.repo.language !== 'null') {
          let l = langs.get(e.repo.language);
          if (!l) { l = { language: e.repo.language, stars: 0, forks: 0, events: 0 }; langs.set(e.repo.language, l); }
          l.events++;
        }
      });

      rl.on('close', () => {
        // fold new-repo stars (they may have been starred later in same hour)
        for (const nr of newRepos) {
          const r = repos.get(nr.repo);
          if (r) { nr.stars = r.stars; nr.forks = r.forks; if (r.language) nr.language = r.language; }
        }
        // fold language stars/forks
        for (const [lang, l] of langs) {
          for (const r of repos.values()) {
            if (r.language === lang) { l.stars += r.stars; l.forks += r.forks; }
          }
        }
        const all = [...repos.values()];
        const gainer = (a, b) => (b.stars * 3 + b.forks) - (a.stars * 3 + a.forks);
        const topGainers = all.filter(r => r.stars + r.forks > 0).sort(gainer).slice(0, 25);
        const topActive = all.sort((a, b) => b.events - a.events).slice(0, 25);
        const topLangs = [...langs.values()].sort((a, b) => (b.stars * 3 + b.forks) - (a.stars * 3 + a.forks)).slice(0, 15);
        const newReposSorted = newRepos.sort((a, b) => b.stars - a.stars).slice(0, 20);
        const topReleases = releases.slice(0, 20);

        const snapshot = {
          as_of: `${hourLabel.slice(0, 10)}T${pad(Number(hourLabel.slice(11)))}:00:00Z`,
          hour: hourLabel,
          events,
          repos_seen: repos.size,
          top_gainers: topGainers,
          top_active: topActive,
          top_languages: topLangs,
          new_repos: newReposSorted,
          top_releases: topReleases,
        };
        resolve(snapshot);
      });
      rl.on('error', reject);
      gunzip.on('error', reject);
    }).catch(reject);
  });
}

async function enrich(snapshot) {
  // GH Archive doesn't carry repo language/description. Fetch them from the
  // GitHub API for the visible top repos, caching results across runs.
  const META = path.join(SITE_DATA, 'repo_meta.json');
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(META, 'utf8')); } catch {}
  const want = new Map();
  const add = (list) => (list || []).forEach((r) => {
    if (r && r.repo && !meta[r.repo] && !want.has(r.repo)) want.set(r.repo, r);
  });
  add(snapshot.top_gainers);
  add(snapshot.top_active);
  add(snapshot.new_repos);
  add(snapshot.top_releases);
  const toFetch = [...want.keys()].slice(0, 50);
  let fetched = 0, failed = 0, rateLimited = false;
  for (const name of toFetch) {
    if (rateLimited || fetched >= 50) break;
    try {
      const buf = await get(`https://api.github.com/repos/${name}`);
      const j = JSON.parse(buf.toString('utf8'));
      if (j.language || j.description) {
        meta[name] = { language: j.language || null, description: (j.description || '').slice(0, 200) || null, fetched_at: new Date().toISOString() };
        fetched++;
      }
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) {
      if (/403|rate limit/i.test(e.message)) { rateLimited = true; break; }
      failed++;
      if (failed > 5) break;
    }
  }
  if (fetched) fs.writeFileSync(META, JSON.stringify(meta));
  const apply = (list) => (list || []).forEach((r) => {
    const m = meta[r.repo];
    if (m) { r.language = r.language || m.language; if (!r.desc && m.description) r.desc = m.description; }
  });
  apply(snapshot.top_gainers);
  apply(snapshot.top_active);
  apply(snapshot.new_repos);
  apply(snapshot.top_releases);
  // rebuild language aggregates from enriched repos
  const langAgg = new Map();
  for (const r of [...(snapshot.top_gainers || []), ...(snapshot.top_active || []), ...(snapshot.new_repos || [])]) {
    if (!r.language) continue;
    let l = langAgg.get(r.language);
    if (!l) { l = { language: r.language, stars: 0, forks: 0, repos: 0 }; langAgg.set(r.language, l); }
    l.stars += r.stars || 0; l.forks += r.forks || 0; l.repos++;
  }
  snapshot.top_languages = [...langAgg.values()]
    .sort((a, b) => (b.stars * 3 + b.forks) - (a.stars * 3 + a.forks)).slice(0, 15);
  console.log(`[pulse] enrichment: fetched ${fetched}, rateLimited=${rateLimited}, cache=${Object.keys(meta).length}`);
  return snapshot;
}

async function main() {
  const hourLabel = process.argv[2] || await findLatestHour();
  const localFile = process.argv[3];
  console.log(`[pulse] using hour: ${hourLabel}`);
  const snap = await processHour(hourLabel, localFile);
  await enrich(snap);
  fs.mkdirSync(SITE_DATA, { recursive: true });
  fs.mkdirSync(HIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(SITE_DATA, 'snapshot.json'), JSON.stringify(snap));
  // rolling history: one file per hour label + index for the frontend
  fs.writeFileSync(path.join(HIST_DIR, `${snap.hour}.json`), JSON.stringify(snap));
  try {
    const files = fs.readdirSync(HIST_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
    fs.writeFileSync(path.join(HIST_DIR, 'index.json'), JSON.stringify({ files }));
  } catch (e) { console.error('[pulse] history index failed:', e.message); }
  console.log(`[pulse] wrote snapshot.json (${JSON.stringify(snap).length} bytes), events=${snap.events}, repos=${snap.repos_seen}`);
  console.log(`[pulse] top gainer: ${snap.top_gainers[0] ? snap.top_gainers[0].repo + ' (+' + snap.top_gainers[0].stars + ' stars)' : 'n/a'}`);
}

main().catch((e) => { console.error('[pulse] FAILED:', e.message); process.exit(1); });
