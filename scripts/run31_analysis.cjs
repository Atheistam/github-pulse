// run31_analysis.cjs — THE PLATEAU TEST: does the 10h streak survive h4-h6?
// Questions from run 30's plan:
//  (a) 10h streak (h18->h3): break or extend? is 54-56% really the floor, or do the
//      h2/h3 mints (575/708) fuel another surge h4-h6?
//  (b) ugmoddev: 18h+ continuous? rate hold 166+?
//  (c) h3 synchronized squad (chprotoo/favc17/cburgegro...) — rotate out in 1-2h as predicted?
//  (d) naming template h4-h6
//  (e) wave radar state (PEAK at h3 -> ?)
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

const last = series[series.length - 1];
console.log(`=== LAST HOUR IN HISTORY: ${last.hour} (n=${series.length} hours) ===`);

console.log('\n=== (a) SPAM TRAJECTORY h23 -> h6 (streak stress test) ===');
const tail = series.filter(s => cmp(s.hour, '2026-08-14-23') >= 0);
let prev = null;
for (const s of tail) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50% BREACH' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (a) STREAK ANALYSIS: consecutive >=50% hours ===');
let run = 0, best = 0, bestEnd = '';
for (const s of series) {
  if (s.push_spam_pct >= 50) { run++; if (run > best) { best = run; bestEnd = s.hour; } }
  else run = 0;
}
console.log(`longest streak: ${best} consecutive hours ending ${bestEnd}`);
run = 0; let curEnd = '';
for (const s of series) {
  if (s.push_spam_pct >= 50) { run++; curEnd = s.hour; } else run = 0;
}
console.log(`current streak: ${run} consecutive hours ending ${curEnd}`);

console.log('\n=== ALL-TIME EXTREMES (103h) ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 5);
console.log('highest 5:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

console.log('\n=== (b) VETERAN PERSISTENCE: hourly push rates h0 -> h6 ===');
const vets = ['ugmoddev', 'elad-cmd', 'jvhoang', 'LiamBruhin', 'wsch40', 'srjordan6', 'twoai-content', 'chprotoo', 'favc17', 'cburgegro'];
const hourly = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-0') < 0) continue;
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
}
const hseq = Object.keys(hourly).sort(cmp);
for (const v of vets) {
  const rates = hseq.map(h => `${h.slice(11)}:${hourly[h][v] || 0}`).join('  ');
  console.log(`${v.padEnd(14)} ${rates}`);
}

// ugmoddev full hourly rate across entire history (h13 -> h6)
console.log('\n=== (b) ugmoddev FULL TRACE h13 -> h6 ===');
const hourly2 = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-14-13') < 0) continue;
  hourly2[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'ugmoddev') hourly2[s.hour] += f.pushes;
  }
}
const hseq2 = Object.keys(hourly2).sort(cmp);
let consecutive = 0, bestRun = 0, bestRunEnd = '';
for (const h of hseq2) {
  if (hourly2[h] > 0) { consecutive++; if (consecutive > bestRun) { bestRun = consecutive; bestRunEnd = h; } }
  else consecutive = 0;
}
console.log(`hours with activity: ${hseq2.filter(h => hourly2[h] > 0).length}/${hseq2.length}  longest continuous: ${bestRun} ending ${bestRunEnd}`);
console.log(hseq2.map(h => `${h.slice(11)}:${hourly2[h]}`).join('  '));

console.log('\n=== (c) H3 SYNC SQUAD TRACE (chprotoo/favc17/cburgegro + h3 top fresh actors) ===');
const squad = ['chprotoo', 'favc17', 'cburgegro'];
const h3farms = (series.find(s => s.hour === '2026-08-15-3') || {}).bot_watch || [];
const h3top = h3farms.slice().sort((a, b) => b.pushes - a.pushes).slice(0, 12);
for (const f of h3top) {
  const nm = f.actor_names[0];
  if (!squad.includes(nm)) squad.push(nm);
}
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-3') >= 0)) {
  const parts = [];
  for (const a of squad) {
    const r = hourly[s.hour] && hourly[s.hour][a];
    if (r) parts.push(`${a}:${r}`);
  }
  console.log(`${s.hour}: ${parts.length ? parts.join('  ') : 'ALL GONE'}`);
}

console.log('\n=== (d) NAMING TEMPLATE HOUR-BY-HOUR h0 -> h6 (top 6 fresh actors) ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-0') >= 0)) {
  const farms = (s.bot_watch || []).slice().sort((a, b) => b.pushes - a.pushes).slice(0, 6);
  const names = farms.map(f => `${f.actor_names[0]}(${f.pushes})`).join('  ');
  console.log(`${s.hour}: ${names}`);
}

console.log('\n=== (e) WAVE RADAR h0 -> h6 ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-0') >= 0)) {
  console.log(`${s.hour}: wave=${s.wave || 'n/a'}  spam=${s.push_spam_pct}%`);
}

console.log('\n=== TOP FARMS h4-h6 (fresh vs veteran mix) ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-4') >= 0)) {
  const farms = (s.bot_watch || []).slice().sort((a, b) => b.pushes - a.pushes).slice(0, 10);
  console.log(`\n${s.hour}:`);
  for (const f of farms) {
    const mark = f.hours_seen >= 8 ? 'VETERAN' : (f.hours_seen >= 3 ? 'mid' : 'FRESH');
    console.log(`  ${String(f.pushes).padStart(4)}/hr ${String(f.actor_names[0]).padEnd(18)} ${f.repo}  seen ${f.hours_seen}h ${mark}`);
  }
}

console.log('\n=== MINTING vs BREACHES h16+ (lead-time rule: formally dead?) ===');
const breaches = series.filter(s => s.push_spam_pct >= 50).map(s => s.hour);
const mints = Object.entries(batch).filter(([h, n]) => n >= 500).sort((a, b) => cmp(a[0], b[0]));
console.log('last 8 mint>=500:', mints.slice(-8).map(([h, n]) => `${h} (${n})`).join(', '));
console.log('breaches h16+: ', breaches.filter(h => cmp(h, '2026-08-14-16') >= 0).join(', '));
console.log('minting h0-h6:  ', ['0','1','2','3','4','5','6'].map(h => `${h}:${batch['2026-08-15-' + h] || 0}`).join('  '));

console.log('\n=== LEDGER: hours_seen TOP 15 actors (all-time persistence) ===');
const seen = Object.entries(ledger).map(([name, e]) => ({ name, n: (e.hours || []).length, first: (e.hours || [])[0], last: (e.hours || []).slice(-1)[0] }));
seen.sort((a, b) => b.n - a.n);
for (const s of seen.slice(0, 15)) console.log(`${String(s.n).padStart(3)}h ${s.name.padEnd(22)} ${s.first} -> ${s.last}`);
