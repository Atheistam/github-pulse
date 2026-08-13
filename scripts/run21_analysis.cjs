// run21_analysis.cjs — extract spam series, test 3h cadence hypothesis vs hour 18
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');

const files = fs.readdirSync(HIST).filter(f => f.endsWith('.json')).sort();
const series = [];
for (const f of files) {
  const h = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));
  series.push({ hour: h.hour || f.replace('.json', ''), spam: h.push_spam_pct || 0, events: h.events || 0, demoted: h.demoted_total || 0, farms: (h.bot_watch || []).length });
}
series.sort((a, b) => a.hour.localeCompare(b.hour));

console.log('hours tracked:', series.length);
console.log('first:', series[0].hour, 'last:', series[series.length - 1].hour);
console.log('');
console.log('spam series (hour: spam%)');
for (const s of series) {
  const bar = '█'.repeat(Math.round(s.spam / 5)) + '░'.repeat(Math.max(0, 20 - Math.round(s.spam / 5)));
  console.log(`${s.hour}  ${String(s.spam).padStart(5)}% ${bar}`);
}
console.log('');

// local maxima >= 50% (same rule as v5.7 panel)
const peaks = [];
for (let i = 1; i < series.length - 1; i++) {
  const a = series[i - 1], b = series[i], c = series[i + 1];
  if (b.spam >= 50 && b.spam >= a.spam && b.spam >= c.spam) peaks.push(b.hour + ' ' + b.spam + '%');
}
// also check ends (series[0] and last can be peaks if >=50)
if (series[0].spam >= 50 && series[0].spam >= (series[1]?.spam || 0)) peaks.unshift(series[0].hour + ' ' + series[0].spam + '%');
const last = series[series.length - 1];
if (last.spam >= 50 && last.spam >= (series[series.length - 2]?.spam || 0)) peaks.push(last.hour + ' ' + last.spam + '%');
console.log('peaks (>=50%):', peaks.join(' | '));

// cadence gaps between consecutive peaks (in hours)
const peakIdx = [];
for (let i = 1; i < series.length - 1; i++) {
  const a = series[i - 1], b = series[i], c = series[i + 1];
  if (b.spam >= 50 && b.spam >= a.spam && b.spam >= c.spam) peakIdx.push(i);
}
if (series[0].spam >= 50 && series[0].spam >= (series[1]?.spam || 0)) peakIdx.unshift(0);
const li = series.length - 1;
if (last.spam >= 50 && last.spam >= (series[li - 1]?.spam || 0)) peakIdx.push(li);
const gaps = [];
for (let i = 1; i < peakIdx.length; i++) {
  const d = series[peakIdx[i]].hour.slice(-2) - series[peakIdx[i - 1]].hour.slice(-2);
  gaps.push(d);
}
console.log('peak hours:', peakIdx.map(i => series[i].hour).join(' -> '));
console.log('gaps (h):', gaps.join(', '));

// hypothesis test: h18 expected peak ~60% (3h cadence), actual?
const h18 = series.find(s => s.hour === '2026-08-13-18');
console.log('');
console.log('HYPOTHESIS TEST h18:', h18 ? `${h18.spam}% (predicted ~60% cadence peak)` : 'n/a');
console.log('verdict:', h18 && h18.spam >= 50 ? 'CADENCE HOLDS' : h18 ? 'CADENCE MISS — peak did not land at h18' : 'n/a');

// lead-time check: new ledger actors per hour (minting) for last 14h
try {
  const led = require(path.join(__dirname, '..', 'site', 'data', 'farm_actors.json'));
  const arr = Array.isArray(led) ? led : Object.values(led);
  const byHour = {};
  for (const a of arr) {
    const hs = a.hours || [];
    if (!hs.length) continue;
    const first = hs.slice().sort()[0];
    const h = String(first).slice(0, 13);
    byHour[h] = (byHour[h] || 0) + 1;
  }
  const hours = Object.keys(byHour).sort();
  console.log('');
  console.log('MINTING — new ledger actors per hour (last 14):');
  for (const h of hours.slice(-14)) console.log(' ', h, byHour[h]);
  // correlate: hour with >=500 minted vs next-2h spam
  console.log('');
  console.log('factory hours (>=500 minted):', hours.filter(h => byHour[h] >= 500).slice(-8).join(', ') || 'none');
  const h16 = byHour['2026-08-13-16'], h17 = byHour['2026-08-13-17'], h18 = byHour['2026-08-13-18'];
  console.log(`minting h16=${h16 || 0} h17=${h17 || 0} h18=${h18 || 0} (spam was 44.7 / 31.2 / 43.6)`);
} catch (e) { console.log('minting check failed:', e.message); }
