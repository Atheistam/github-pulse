#!/usr/bin/env node
const s = require('../site/data/snapshot.json');
// check for regro-cf-autotick-bot and guillaume-flambard in any flagged lists
const targets = ['regro-cf-autotick-bot', 'guillaume-flambard', 'vndel', 'solispirit', 'deerinwild', 'akitafi', 'infernusscripts', 'mac-lang-volpe', 'loganfoxdale', 'ppfdalerts'];
const idx = {};
for (const list of [s.top_hot, s.top_active, s.top_human, s.bot_watch, s.demoted]) for (const r of list || []) idx[r.repo] = r;
for (const t of targets) {
  const hits = Object.keys(idx).filter(k => k.toLowerCase().startsWith(t));
  if (!hits.length) { console.log(t.padEnd(24), 'not in any top list this hour'); continue; }
  for (const h of hits) {
    const r = idx[h];
    console.log(t.padEnd(24), h, 'flag=' + (r.flag || '-'), 'pushes=' + r.pushes, 'prs=' + r.prs, 'issues=' + r.issues, 'actors=' + r.actors, 'desc=' + (r.desc || '').slice(0, 60));
  }
}
