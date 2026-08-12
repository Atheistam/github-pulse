#!/usr/bin/env node
/**
 * Generate site/api/farms.json — compact public farm ledger endpoint.
 * Built from farm_actors.json (actor → hours) + snapshot.json (current stats).
 * Kept small: top N actors by hours seen + aggregate stats. Full ledger stays
 * in data/farm_actors.json for heavy consumers.
 */
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
const FA = path.join(SITE, 'data', 'farm_actors.json');
const SNAP = path.join(SITE, 'data', 'snapshot.json');

let actors = {};
try { actors = JSON.parse(fs.readFileSync(FA, 'utf8')); } catch { console.error('no farm_actors.json'); process.exit(1); }
let snap = {};
try { snap = JSON.parse(fs.readFileSync(SNAP, 'utf8')); } catch {}

const entries = Object.entries(actors)
  .map(([actor, e]) => ({
    actor,
    hours_seen: (e.hours || []).length,
    last_seen: e.lastSeen || null,
    confirmed: (e.hours || []).length >= 2,
  }))
  .sort((a, b) => b.hours_seen - a.hours_seen);

const out = {
  generated_at: new Date().toISOString(),
  source: 'https://github-pulse.surge.sh/',
  stats: {
    total_actors: entries.length,
    confirmed_actors: entries.filter((e) => e.confirmed).length,
    hour: snap.hour || null,
    push_spam_pct: snap.push_spam_pct ?? null,
    demoted_total: snap.demoted_total ?? null,
    suspicious_total: snap.suspicious_total ?? null,
  },
  top_actors: entries.slice(0, 500).map(({ actor, hours_seen, last_seen, confirmed }) => ({ actor, hours_seen, last_seen, confirmed })),
  schema: {
    actor: 'GitHub username',
    hours_seen: 'distinct hours this account appeared in a flagged repo',
    confirmed: '>=2 distinct hours — demotes any repo this actor touches',
  },
};

fs.mkdirSync(path.join(SITE, 'api'), { recursive: true });
fs.writeFileSync(path.join(SITE, 'api', 'farms.json'), JSON.stringify(out));
console.log(`[api] farms.json written: ${entries.length} actors (${out.stats.confirmed_actors} confirmed), ${(fs.statSync(path.join(SITE, 'api', 'farms.json')).size / 1024).toFixed(1)} KB`);
