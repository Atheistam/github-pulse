// run37_analysis.cjs — h1-h3: does the plateau crack? does the factory re-arm?
// Questions from run 36's plan:
//  (a) plateau: h0 -3.1pt was first down-tick — crack or hold through h3?
//  (b) minting: factory re-arm after all-time idle 213/6h?
//  (c) ugmoddev: 364/hr -> break 400? still dual-repo?
//  (d) elad-cmd: full-time persists or shifts return?
//  (e) zerotraceh1 cycler timing; Janfindl retirement 15h+?
//  (f) danialzivehdadr stays #1 farm?
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
const conf = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  if (hrs[0]) batch[hrs[0]] = (batch[hrs[0]] || 0) + 1;
  if (hrs[0] && e.confirmed) conf[hrs[0]] = (conf[hrs[0]] || 0) + 1;
}

const last = series[series.length - 1];
console.log(`=== LAST HOUR IN HISTORY: ${last.hour} (n=${series.length} hours) ===`);

console.log('\n=== (a) SPAM TRAJECTORY h17 Aug15 -> h3 Aug16 (plateau crack?) ===');
let prev = null;
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-17') >= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (b) MINTING h15 Aug15 -> h3 Aug16 (re-arm after idle record?) ===');
console.log(['15','16','17','18','19','20','21','22','23','0','1','2','3'].map(h => `h${h}:${batch['2026-08-15-' + h] || 0}(c${conf['2026-08-15-' + h] || 0})`).join('  '));
console.log('(h0-h3 Aug16 = first_seen on 2026-08-16-N)');

console.log('\n=== (a) BREACH STREAK (full history) ===');
let run = 0, curEnd = '';
for (const s of series) { if (s.push_spam_pct >= 50) { run++; curEnd = s.hour; } else run = 0; }
console.log(`current streak: ${run} consecutive hours ending ${curEnd}`);
const allBreaches = series.filter(s => s.push_spam_pct >= 50).map(s => s.hour);
console.log(`total >=50% hours: ${allBreaches.length}/${series.length}; last 12: ${allBreaches.slice(-12).join(', ')}`);

console.log('\n=== ALL-TIME EXTREMES ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 8);
console.log('highest 8:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

// hourly actor rates h15 -> h3 from bot_watch
const hourly = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-15') < 0) continue;
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
}
const hseq = Object.keys(hourly).sort(cmp);

console.log('\n=== (c/d/e) VETERAN TRACE h15 -> h3 ===');
const vets = ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'danialzivehdadr', 'ThatOneFrench', 'winson-00178005', 'J8F8k93gAj26', 'VPvZkLZTNHf19', 'ZGXVQhXOjKD29', 'aLGR5RKc89', '1gRU847VX48', 'loganfoxdale', 'Kelisiqiang', '3215colt'];
for (const v of vets) {
  const rates = hseq.map(h => `${h.slice(11)}:${hourly[h][v] || 0}`).join('  ');
  console.log(`${v.padEnd(18)} ${rates}`);
}

console.log('\n=== (d) LEDGER PERSISTENCE (key actors) ===');
for (const v of ['J8F8k93gAj26', 'VPvZkLZTNHf19', 'ZGXVQhXOjKD29', 'aLGR5RKc89', '1gRU847VX48', 'zerotraceh1', 'Janfindl', 'ugmoddev', 'elad-cmd', 'danialzivehdadr']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(18)} first:${(e.hours||[])[0]||'?'} last:${(e.hours||[]).slice(-1)[0]||'?'} hours:${(e.hours||[]).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(18)} NOT IN LEDGER`);
}

console.log('\n=== (e) NAMING TEMPLATES h19-h0 (top-15 farm actors) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-19') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const names = top.slice(0, 15).map(t => t.repo.split('/')[0]);
  console.log(`${s.hour}  ${names.join(', ')}`);
}

console.log('\n=== (c) ugmoddev FULL TRACE h13 Aug14 -> h3 Aug16 ===');
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
console.log('\n=== (e) zerotraceh1 FULL TRACE (cycler) ===');
const hourly3 = {};
for (const s of series) {
  hourly3[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'zerotraceh1') hourly3[s.hour] += f.pushes;
  }
}
const zt = Object.keys(hourly3).sort(cmp);
console.log(zt.slice(-48).map(h => `${h.slice(5)}:${hourly3[h]}`).join('  '));

// elad-cmd full trace (shift cadence vs full-time)
console.log('\n=== (d) elad-cmd FULL TRACE (shift vs full-time) ===');
const hourly4 = {};
for (const s of series) {
  hourly4[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'elad-cmd') hourly4[s.hour] += f.pushes;
  }
}
const el = Object.keys(hourly4).sort(cmp);
console.log(el.slice(-48).map(h => `${h.slice(5)}:${hourly4[h]}`).join('  '));

// Janfindl full trace (retired?)
console.log('\n=== (e) Janfindl FULL TRACE (retirement check) ===');
const hourly5 = {};
for (const s of series) {
  hourly5[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'Janfindl') hourly5[s.hour] += f.pushes;
  }
}
const jf = Object.keys(hourly5).sort(cmp);
console.log(jf.slice(-36).map(h => `${h.slice(5)}:${hourly5[h]}`).join('  '));

// wave radar state
console.log('\n=== WAVE RADAR (h12 Aug15 -> h3 Aug16) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-12') < 0) continue;
  console.log(`${s.hour}  wave=${s.wave || '?'}  push_spam_pct=${s.push_spam_pct}`);
}

// farm count + top farms h1-h3
console.log('\n=== FARMS h1-h3 (bot_watch top-5 per hour) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-1') < 0) continue;
  const bw = (s.bot_watch || []).slice(0, 5).map(f => `${f.repo}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  n=${(s.bot_watch||[]).length}  ${bw}`);
}

// danialzivehdadr specific trace
console.log('\n=== (f) danialzivehdadr FULL TRACE ===');
const hourly6 = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-22') < 0) continue;
  hourly6[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'danialzivehdadr') hourly6[s.hour] += f.pushes;
  }
}
console.log(Object.keys(hourly6).sort(cmp).map(h => `${h.slice(11)}:${hourly6[h]}`).join('  '));

// demotion extremes
console.log('\n=== DEMOTIONS — all-time top 8 ===');
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 8);
console.log(demos.map(x => `${x.hour} ${x.demoted_total}`).join(' | '));
