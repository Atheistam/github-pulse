#!/usr/bin/env node
// spam trajectory analyzer: read all history files, emit spam% per hour
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d+\.json$/.test(f)).sort();
const rows = [];
for (const f of files) {
  try {
    const h = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));
    const pct = h.push_spam_pct != null ? h.push_spam_pct
      : (h.stats && h.stats.push_spam_pct != null) ? h.stats.push_spam_pct : null;
    const pushes = h.push_events != null ? h.push_events
      : (h.stats && h.stats.push_events != null) ? h.stats.push_events : null;
    rows.push({ hour: f.replace('.json', ''), pct, pushes, farms: h.farms != null ? h.farms : (h.stats && h.stats.farms) });
  } catch (e) { /* skip */ }
}
console.log('hours tracked:', rows.length);
console.log('hour | spam% | farms');
for (const r of rows.slice(-28)) {
  console.log(`${r.hour} | ${r.pct != null ? r.pct.toFixed(1) + '%' : '?'} | ${r.farms != null ? r.farms : '?'}`);
}
const vals = rows.filter(r => r.pct != null);
if (vals.length) {
  const min = Math.min(...vals.map(v => v.pct)), max = Math.max(...vals.map(v => v.pct));
  const last3 = vals.slice(-3).map(v => v.pct.toFixed(1));
  console.log(`\nrange: ${min.toFixed(1)}% .. ${max.toFixed(1)}% | last3: ${last3.join(', ')}`);
  // cycle detection: count direction changes
  let flips = 0;
  for (let i = 2; i < vals.length; i++) {
    const a = vals[i-2].pct, b = vals[i-1].pct, c = vals[i].pct;
    if ((b - a) * (c - b) < 0) flips++;
  }
  console.log(`direction flips in last ${vals.length} hours: ${flips} (avg period ~${(vals.length / Math.max(1, flips)).toFixed(1)}h)`);
}
