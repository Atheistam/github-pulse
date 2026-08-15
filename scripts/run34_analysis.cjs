// run34_analysis.cjs — h13-h15: does the plateau hold or finally crash?
// Questions from run 33's plan:
//  (a) plateau (h8-h12, 61-64% band) hold past 5h or crash (h13-style -20pt)?
//  (b) minting: 590 re-arm continues or factory pauses?
//  (c) shift-based veterans (elad-cmd/Janfindl 2-on/2-off) keep the rhythm?
//  (d) zerotraceh1 cycler: when does it return?
//  (e) ugmoddev: 110th hour? rate hold 100+ or fade?
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

console.log('\n=== (a) SPAM TRAJECTORY h4 -> h15 (plateau hold or crash) ===');
let prev = null;
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-4') >= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (b) MINTING h6 -> h15 (re-arm or pause) ===');
console.log(['6','7','8','9','10','11','12','13','14','15'].map(h => `h${h}:${batch['2026-08-15-' + h] || 0}(c${conf['2026-08-15-' + h] || 0})`).join('  '));

console.log('\n=== (a) BREACH STREAK (full 112h) ===');
let run = 0, curEnd = '';
for (const s of series) { if (s.push_spam_pct >= 50) { run++; curEnd = s.hour; } else run = 0; }
console.log(`current streak: ${run} consecutive hours ending ${curEnd}`);
const allBreaches = series.filter(s => s.push_spam_pct >= 50).map(s => s.hour);
console.log(`total >=50% hours: ${allBreaches.length}/${series.length}; last 8: ${allBreaches.slice(-8).join(', ')}`);

console.log('\n=== ALL-TIME EXTREMES (112h) ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 5);
console.log('highest 5:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

// hourly actor rates h7 -> h15 from bot_watch
const hourly = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-7') < 0) continue;
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
}
const hseq = Object.keys(hourly).sort(cmp);

console.log('\n=== (c/d) VETERAN + SQUAD TRACE h7 -> h15 ===');
const vets = ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'winson-00178005', 'J8F8k93gAj26', 'VPvZkLZTNHf19', 'ZGXVQhXOjKD29', 'aLGR5RKc89', '1gRU847VX48', 'loganfoxdale', 'n-anderson7540', 'MtbWRjeYFXojr67', 'noahanderson828871', 'liamjackson22694', 'luna-jackson4498'];
for (const v of vets) {
  const rates = hseq.map(h => `${h.slice(11)}:${hourly[h][v] || 0}`).join('  ');
  console.log(`${v.padEnd(18)} ${rates}`);
}

console.log('\n=== (d) LEDGER PERSISTENCE (key actors) ===');
for (const v of ['J8F8k93gAj26', 'VPvZkLZTNHf19', 'ZGXVQhXOjKD29', 'aLGR5RKc89', '1gRU847VX48', 'zerotraceh1', 'Janfindl', 'ugmoddev', 'elad-cmd', 'winson-00178005']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(18)} first:${(e.hours||[])[0]||'?'} last:${(e.hours||[]).slice(-1)[0]||'?'} hours:${(e.hours||[]).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(18)} NOT IN LEDGER`);
}

console.log('\n=== (e) NAMING TEMPLATES h13-h15 (top-15 farm actors) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-13') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const names = top.slice(0, 15).map(t => t.repo.split('/')[0]);
  console.log(`${s.hour}  ${names.join(', ')}`);
}

console.log('\n=== (e) ugmoddev FULL TRACE h13 Aug14 -> h15 Aug15 (110th hour?) ===');
const hourly2 = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-14-13') < 0) continue;
  hourly2[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'ugmoddev') hourly2[s.hour] += f.pushes;
  }
}
console.log(Object.keys(hourly2).sort(cmp).map(h => `${h.slice(5)}:${hourly2[h]}`).join('  '));

// zerotraceh1 cycler pattern across full history
console.log('\n=== (d) zerotraceh1 FULL TRACE (cycler?) ===');
const hourly3 = {};
for (const s of series) {
  hourly3[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'zerotraceh1') hourly3[s.hour] += f.pushes;
  }
}
const zt = Object.keys(hourly3).sort(cmp);
console.log(zt.slice(-36).map(h => `${h.slice(5)}:${hourly3[h]}`).join('  '));

// wave radar state
console.log('\n=== WAVE RADAR (h13-h15) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-12') < 0) continue;
  console.log(`${s.hour}  wave=${s.wave || '?'}  push_spam_pct=${s.push_spam_pct}`);
}

// farm count + top farms h13-h15
console.log('\n=== FARMS h13-h15 (bot_watch top-5 per hour) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-13') < 0) continue;
  const bw = (s.bot_watch || []).slice(0, 5).map(f => `${f.repo}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  n=${(s.bot_watch||[]).length}  ${bw}`);
}
