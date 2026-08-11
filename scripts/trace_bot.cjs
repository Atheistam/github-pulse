#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
// find any repo in history flagged lists whose actor_names or owner include regro-cf-autotick-bot
for (const f of fs.readdirSync(HIST).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
  const h = JSON.parse(fs.readFileSync(path.join(HIST, f)));
  for (const [ln, list] of Object.entries({ top_hot: h.top_hot, top_active: h.top_active, bot_watch: h.bot_watch, demoted: h.demoted })) {
    for (const r of list || []) {
      const names = (r.actor_names || []).map(a => a.toLowerCase());
      const owner = String(r.repo || '').split('/')[0].toLowerCase();
      if (names.includes('regro-cf-autotick-bot') || owner === 'regro-cf-autotick-bot') {
        console.log(f, ln, r.repo, 'flag=' + (r.flag || '-'), 'owner=' + owner, 'actors=' + (r.actor_names || []).join(','));
      }
    }
  }
}
// also check snapshot
const s = require('../site/data/snapshot.json');
for (const [ln, list] of Object.entries({ top_hot: s.top_hot, top_active: s.top_active, bot_watch: s.bot_watch, demoted: s.demoted })) {
  for (const r of list || []) {
    const names = (r.actor_names || []).map(a => a.toLowerCase());
    if (names.includes('regro-cf-autotick-bot')) console.log('SNAP', ln, r.repo, 'flag=' + (r.flag || '-'));
  }
}
console.log('--- done ---');
