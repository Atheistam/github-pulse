#!/usr/bin/env node
// verify ledger size + demotion record before writing report v5.19
const fs = require('fs');
const path = require('path');
const l = JSON.parse(fs.readFileSync('site/data/farm_actors.json', 'utf8'));
const vals = Object.values(l);
console.log('ledger actors:', vals.length, '| confirmed:', vals.filter(v => v.confirmed).length);

const HIST = 'site/data/history';
const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).sort(cmp);
let max = 0, maxH = '';
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));
  if (d.demoted_total > max) { max = d.demoted_total; maxH = d.hour; }
}
console.log('max demoted_total:', max, 'at', maxH);
const top5 = files.map(f => JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')))
  .sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 5);
console.log('top5 demotion hours:', top5.map(d => `${d.hour}:${d.demoted_total}`).join(' | '));
