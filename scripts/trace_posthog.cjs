#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const fa = require('../site/data/farm_actors.json');
console.log('posthog in ledger:', !!fa['posthog'], '| hours:', fa['posthog'] ? fa['posthog'].hours.length : 0);

for (const f of fs.readdirSync(HIST).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
  const h = JSON.parse(fs.readFileSync(path.join(HIST, f)));
  for (const b of h.bot_watch || []) {
    const owner = String(b.repo || '').split('/')[0].toLowerCase();
    if (owner === 'posthog') console.log('HIST', f, 'bot_watch:', b.repo, 'pushes:', b.pushes);
  }
}
const s = require('../site/data/snapshot.json');
for (const list of [s.top_active, s.bot_watch, s.demoted]) {
  for (const r of list || []) {
    if (String(r.repo || '').toLowerCase().startsWith('posthog')) {
      console.log('SNAP', r.repo, 'flag:', r.flag, 'pushes:', r.pushes, 'actors:', r.actors, 'prs:', r.prs, 'issues:', r.issues, 'stars:', r.stars, 'forks:', r.forks, 'releases:', r.releases, 'reviews:', r.reviews);
    }
  }
}
// which repos in history are owned by posthog and what were their flags
for (const f of fs.readdirSync(HIST).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
  const h = JSON.parse(fs.readFileSync(path.join(HIST, f)));
  for (const list of [h.top_hot || [], h.top_active || [], h.demoted || []]) {
    for (const r of list) {
      if (String(r.repo || '').toLowerCase().startsWith('posthog/')) {
        console.log('HIST', f, r.repo, 'flag:', r.flag, 'pushes:', r.pushes, 'actors:', r.actors, 'prs:', r.prs, 'issues:', r.issues, 'stars:', r.stars, 'forks:', r.forks);
      }
    }
  }
}
