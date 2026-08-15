// run33_analysis.cjs — h10-h12: does the reborn surge extend or decay?
// Questions from run 32's plan:
//  (a) h8/h9 surge (56.0% -> 64.4%): decay or extend through h10-h12?
//  (b) minting h10-h12: decelerating (576/355) or re-arm?
//  (c) zerotraceh1 persistence (cycler?) + base64 sync squad rotation
//  (d) ugmoddev: 23h+? rate hold 180+?
//  (e) naming templates h10-h12
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const LEDGER = path.join(__dirname, '..', 'site', 'data', 'farm_actors.json');

const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).sort(cmp);
const series = [];
for (const f of files) series.push(JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')));
series.sort((a, b) => cmp(a.hour, b.hour));

const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const batch = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  if (hrs[0]) batch[hrs[0]] = (batch[hrs[0]] || 0) + 1;
}
const conf = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  if (hrs[0] && e.confirmed) conf[hrs[0]] = (conf[hrs[0]] || 0) + 1;
}

const last = series[series.length - 1];
console.log(`=== LAST HOUR IN HISTORY: ${last.hour} (n=${series.length} hours) ===`);

console.log('\n=== (a) SPAM TRAJECTORY h6 -> h12 (surge extend or decay) ===');
let prev = null;
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-6') >= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (b) MINTING h6 -> h12 (re-arm watch) ===');
console.log(['6','7','8','9','10','11','12'].map(h => `h${h}:${batch['2026-08-15-' + h] || 0}(c${conf['2026-08-15-' + h] || 0})`).join('  '));

console.log('\n=== (a) BREACH STREAK (full 109h) ===');
let run = 0, curEnd = '';
for (const s of series) { if (s.push_spam_pct >= 50) { run++; curEnd = s.hour; } else run = 0; }
console.log(`current streak: ${run} consecutive hours ending ${curEnd}`);
const allBreaches = series.filter(s => s.push_spam_pct >= 50).map(s => s.hour);
console.log(`total >=50% hours: ${allBreaches.length}/${series.length}; last 8: ${allBreaches.slice(-8).join(', ')}`);

console.log('\n=== ALL-TIME EXTREMES (109h) ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 5);
console.log('highest 5:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

// hourly actor rates h7 -> h12 from bot_watch
const hourly = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-7') < 0) continue;
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
}
const hseq = Object.keys(hourly).sort(cmp);

console.log('\n=== (c/d) VETERAN + SQUAD TRACE h7 -> h12 ===');
const vets = ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'winson-00178005', 'J8F8k93gAj26', 'VPvZkLZTNHf19', 'ZGXVQhXOjKD29', 'aLGR5RKc89', '1gRU847VX48', 'loganfoxdale', 'n-anderson7540', 'MtbWRjeYFXojr67', 'noahanderson828871'];
for (const v of vets) {
  const rates = hseq.map(h => `${h.slice(11)}:${hourly[h][v] || 0}`).join('  ');
  console.log(`${v.padEnd(18)} ${rates}`);
}

console.log('\n=== (c) BASE64 SQUAD SURVIVAL (J8F8k93gAj26 et al full ledger hours) ===');
for (const v of ['J8F8k93gAj26', 'VPvZkLZTNHf19', 'ZGXVQhXOjKD29', 'aLGR5RKc89', '1gRU847VX48', 'zerotraceh1', 'Janfindl', 'ugmoddev']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(18)} first:${(e.hours||[])[0]||'?'} last:${(e.hours||[]).slice(-1)[0]||'?'} hours:${(e.hours||[]).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(18)} NOT IN LEDGER`);
}

// (e) naming: top farm actor names h10-h12 from farm_probe
console.log('\n=== (e) NAMING TEMPLATES h10-h12 (top-15 farm actors) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-10') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const names = top.slice(0, 15).map(t => t.repo.split('/')[0]);
  console.log(`${s.hour}  ${names.join(', ')}`);
}

console.log('\n=== (d) ugmoddev FULL TRACE h13 Aug14 -> h12 Aug15 ===');
const hourly2 = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-14-13') < 0) continue;
  hourly2[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'ugmoddev') hourly2[s.hour] += f.pushes;
  }
}
console.log(Object.keys(hourly2).sort(cmp).map(h => `${h.slice(5)}:${hourly2[h]}`).join('  '));
