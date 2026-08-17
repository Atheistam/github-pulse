#!/usr/bin/env node
/**
 * spray_radar.cjs — find push-SPRAY farms in the latest complete archive hour.
 *
 * A push-spray farm (e.g. bogdanstancu1119-maker) pushes 200-700 events/hr
 * TOTAL but spreads them across many repos at ~20-55/repo/hr, so every repo
 * sits under the top-15 bot_watch cutoff and the farm is invisible in every
 * top list. This script scans the raw archive and flags:
 *   - actors with >= MIN_TOTAL pushes in the hour
 *   - whose max pushes on ANY single repo is below BOT_CUTOFF (sprayed thin)
 *   - across >= MIN_REPOS repos
 * Excludes shared platform bots. Cross-references the farm ledger.
 *
 * Usage: node scripts/spray_radar.cjs [hourLabel]   (default: latest complete)
 * Writes: site/data/spray.json  (top spray farms for report panel)
 */
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SITE_DATA = path.join(__dirname, '..', 'site', 'data');
const MIN_TOTAL = 100;      // total pushes/hr to be worth flagging
const MIN_REPOS = 4;        // spray = spread across at least this many repos
const BOT_CUTOFF = 70;      // repo pushes below this = invisible in top-15 lists
const SHARED_BOTS = new Set([
  'github-actions[bot]', 'dependabot[bot]', 'renovate[bot]', 'pull[bot]',
  'swa-runner-app[bot]', 'mmdb-bot[bot]', 'cursor[bot]', 'codecov[bot]',
  'imgbot[bot]', 'dependabot-preview[bot]', 'snyk-bot', 'greenkeeper[bot]',
  'coveralls[bot]', 'gitter-badger', 'houndci-bot', 'gitkraken-ci',
]);

function fetchGz(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        zlib.gunzip(Buffer.concat(chunks), (err, buf) => err ? reject(err) : resolve(buf.toString('utf8')));
      });
    }).on('error', reject);
  });
}

async function latestHour() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const label = (d, h) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${h}`;
  for (let back = 2; back <= 6; back++) {
    const d = new Date(now.getTime() - back * 3600 * 1000);
    const cand = label(d, d.getUTCHours());
    try {
      await fetchGz(`https://data.gharchive.org/${cand}.json.gz`);
      return cand;
    } catch { /* try older */ }
  }
  throw new Error('no archive hour found');
}

(async () => {
  const hour = process.argv[2] || await latestHour();
  console.log(`[spray] scanning ${hour} ...`);
  const raw = await fetchGz(`https://data.gharchive.org/${hour}.json.gz`);
  // actor -> { total, repos: {repo: pushes} }
  const stats = new Map();
  for (const line of raw.split('\n')) {
    if (!line) continue;
    try {
      const e = JSON.parse(line);
      if (e.type !== 'PushEvent' || !e.actor || !e.repo) continue;
      const a = e.actor.login;
      if (SHARED_BOTS.has(a)) continue;
      let st = stats.get(a);
      if (!st) { st = { total: 0, repos: new Map() }; stats.set(a, st); }
      st.total++;
      st.repos.set(e.repo.name, (st.repos.get(e.repo.name) || 0) + 1);
    } catch { /* skip malformed */ }
  }

  // Load ledger for known-farm cross-reference
  let ledger = {};
  try { ledger = JSON.parse(fs.readFileSync(path.join(SITE_DATA, 'farm_actors.json'), 'utf8')); } catch {}

  const spray = [];
  for (const [actor, st] of stats) {
    if (st.total < MIN_TOTAL) continue;
    if (st.repos.size < MIN_REPOS) continue;
    const maxRepo = Math.max(...st.repos.values());
    if (maxRepo >= BOT_CUTOFF) continue; // one repo hot enough to surface — not a spray
    const entries = [...st.repos.entries()].sort((a, b) => b[1] - a[1]);
    spray.push({
      actor,
      total: st.total,
      repos: st.repos.size,
      max_repo: maxRepo,
      avg_repo: Math.round(st.total / st.repos.size),
      top_repos: entries.slice(0, 6).map(([r, p]) => `${r}(${p})`),
      known: !!ledger[actor.toLowerCase()],
    });
  }
  spray.sort((a, b) => b.total - a.total);

  const out = { hour, generated: new Date().toISOString(), scanned_bytes: raw.length, count: spray.length, farms: spray.slice(0, 25) };
  fs.writeFileSync(path.join(SITE_DATA, 'spray.json'), JSON.stringify(out));
  console.log(`[spray] ${spray.length} spray farms (total>=${MIN_TOTAL}/hr, max repo <${BOT_CUTOFF}/hr, >=${MIN_REPOS} repos)`);
  for (const f of spray.slice(0, 12)) {
    console.log(`  ${f.actor.padEnd(28)} total=${String(f.total).padStart(4)} repos=${f.repos} max=${f.max_repo} avg=${f.avg_repo}${f.known ? ' [ledger]' : ' [NEW]'}  ${f.top_repos.slice(0, 3).join(' ')}`);
  }
})().catch((e) => { console.error('[spray] ERROR', e.message); process.exit(1); });
