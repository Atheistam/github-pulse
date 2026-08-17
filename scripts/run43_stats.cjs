// run43_stats.cjs — quick stats for report v5.29
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).sort(cmp);
const series = [];
for (const f of files) series.push(JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')));
series.sort((a, b) => cmp(a.hour, b.hour));
const over50 = series.filter(s => s.push_spam_pct >= 50).length;
console.log('hours:', series.length, '>=50%:', over50, 'pct:', (100 * over50 / series.length).toFixed(1) + '%');
// minting sum h16->h0
const ledger = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', 'farm_actors.json'), 'utf8'));
const batch = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  if (hrs[0]) batch[hrs[0]] = (batch[hrs[0]] || 0) + 1;
}
let sum = 0;
for (const k of ['2026-08-16-16','2026-08-16-17','2026-08-16-18','2026-08-16-19','2026-08-16-20','2026-08-16-21','2026-08-16-22','2026-08-16-23','2026-08-17-0']) sum += batch[k] || 0;
console.log('minted h16->h0:', sum, 'avg/hr:', (sum / 9).toFixed(0));
// top-15 demotion days distribution
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 15);
const d15 = demos.map(x => x.hour.slice(0, 10));
const cnt = {};
for (const d of d15) cnt[d] = (cnt[d] || 0) + 1;
console.log('top-15 demotion hours by day:', JSON.stringify(cnt));
// ugmoddev hours presence
let uHours = 0;
for (const s of series) {
  const has = (s.bot_watch || []).some(f => (f.actor_names || []).includes('ugmoddev'));
  if (has) uHours++;
}
console.log('ugmoddev hours present:', uHours, '/', series.length);
