#!/usr/bin/env node
// Scan history for real-looking actors that repeat across hours (farm adaptation check)
const fs = require('fs');
const targets = ['ugmoddev', 'jvhoang', 'xolirx', 'elad-cmd', 'wave-res', 'zerotraceh1', 'loan96060-tech', 'betorj04'];
const found = {};
for (const f of fs.readdirSync('site/data/history').filter(f => f.endsWith('.json') && f !== 'index.json')) {
  const h = JSON.parse(fs.readFileSync('site/data/history/' + f));
  const lists = [h.top_active || [], h.bot_watch || [], h.demoted || []];
  for (const list of lists) for (const r of list) {
    for (const t of targets) {
      if ((r.repo || '').toLowerCase().startsWith(t)) {
        (found[t] = found[t] || []).push(f.replace('.json', '') + ':' + (r.repo || '').split('/')[1] + '(p' + (r.pushes || 0) + ')');
      }
    }
  }
}
for (const t of targets) console.log(t.padEnd(14), found[t] ? found[t].join(' | ') : '-- none --');
