#!/usr/bin/env node
const s = require('../site/data/snapshot.json');
const targets = ['LiamBruhin/SillyStuff', 'betorj04/data34', 'jvhoang/p6v2-public-stats', 'ugmoddev/API-NEW-NAT-3-', 'zerotraceh1/er-forge-probe', 'elad-cmd/psycho-usage', 'wave-res/wave-resources', 'loan96060-tech/vbpl-storage-dp-1', 'xolirx/list-check', 'betorj04/Toggle_Server102'];
const idx = {};
for (const list of [s.top_hot, s.top_active, s.bot_watch, s.demoted]) for (const r of list || []) idx[r.repo] = r;
for (const t of targets) {
  const r = idx[t];
  if (!r) { console.log(t.padEnd(40), 'NOT FOUND'); continue; }
  console.log(t.padEnd(40), 'flag=' + (r.flag || '-'), 'actors=' + r.actors, 'actor_names=' + (r.actor_names || []).join(','));
}
