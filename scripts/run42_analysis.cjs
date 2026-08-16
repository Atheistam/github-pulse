// run42_analysis.cjs — h16-h18: STREAK VS RECORD? NOON RITUAL DECAY? VETERAN SHIFTS?
// Questions from run 41's plan:
//  (a) streak 7 -> 8-10 or collapse? (record = 10 consecutive >=50% hours)
//  (b) loganfoxdale noon ritual — decay continues? h12-only fingerprint holds? any off-window activity?
//  (c) ugmoddev total fade or re-ramp?
//  (d) elad-cmd shift timing (gaps growing?)
//  (e) Janfindl morning-shift (h6-h8) pattern, off h16-h18?
//  (f) real-word disguise tier (twainswee, janbeoty, spl1ce) duration 5h+?
//  (g) factory mint rate steady-state; demotion records h14/h15 -> h16-h18
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
const totalEvents = series.reduce((a, s) => a + s.events, 0);
console.log(`=== LAST HOUR IN HISTORY: ${last.hour} (n=${series.length} hours, ${totalEvents.toLocaleString()} events) ===`);

console.log('\n=== (a) SPAM TRAJECTORY h13 -> h18 Aug16 (streak check) ===');
let prev = null;
let streak = 0, streakEnd = '';
for (const s of series) { if (s.push_spam_pct >= 50) { streak++; streakEnd = s.hour; } else streak = 0; }
console.log(`current >=50% streak: ${streak} hours ending ${streakEnd} (all-time record: 10)`);
for (const s of series.filter(x => cmp(x.hour, '2026-08-16-13') >= 0 && cmp(x.hour, '2026-08-16-18') <= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (a) ALL-TIME >=50% STREAKS (top 5) ===');
let runs = [], cur = 0, start = '';
for (const s of series) {
  if (s.push_spam_pct >= 50) { if (cur === 0) start = s.hour; cur++; }
  else { if (cur > 0) runs.push([start, series[series.indexOf(s) - 1].hour, cur]); cur = 0; }
}
if (cur > 0) runs.push([start, series[series.length - 1].hour, cur]);
runs.sort((a, b) => b[2] - a[2]);
console.log(runs.slice(0, 5).map(r => `${r[2]}h: ${r[0]} -> ${r[1]}`).join(' | '));

console.log('\n=== (a) MINTING h13 -> h18 (factory ~500/hr steady-state?) ===');
console.log(['2026-08-16-13','2026-08-16-14','2026-08-16-15','2026-08-16-16','2026-08-16-17','2026-08-16-18'].map(k => `${k.slice(11)}:${batch[k] || 0}(c${conf[k] || 0})`).join('  '));

console.log('\n=== ALL-TIME EXTREMES ===');
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 10);
console.log('highest 10:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

// hourly actor rates from bot_watch
const hourly = {};
for (const s of series) {
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
}
const hseq = Object.keys(hourly).sort(cmp);

console.log('\n=== (b) THE NOON RITUAL — loganfoxdale FULL TRACE (last 96h) ===');
const lf = {};
for (const s of series) {
  lf[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'loganfoxdale') lf[s.hour] += f.pushes;
  }
}
const lk = Object.keys(lf).sort(cmp);
console.log(lk.slice(-96).map(h => `${h.slice(5)}:${lf[h]}`).join('  '));

console.log('\n=== (b) NOON RITUAL — per-day h11/h12/h13 loganfoxdale rates ===');
const days = {};
for (const s of series) {
  const day = s.hour.slice(0, 10);
  if (/1[123]$/.test(s.hour)) {
    days[day] = days[day] || {};
    days[day][s.hour.slice(11)] = lf[s.hour] || 0;
  }
}
for (const d of Object.keys(days).sort()) {
  console.log(`${d}  h11:${days[d]['11'] || 0}  h12:${days[d]['12'] || 0}  h13:${days[d]['13'] || 0}`);
}

console.log('\n=== (c) ugmoddev FULL TRACE (last 96h) ===');
const hourly2 = {};
for (const s of series) {
  hourly2[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'ugmoddev') hourly2[s.hour] += f.pushes;
  }
}
const uk = Object.keys(hourly2).sort(cmp);
console.log(uk.slice(-96).map(h => `${h.slice(5)}:${hourly2[h]}`).join('  '));

console.log('\n=== (c) ugmoddev in top-15 farm list h13-h18? ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-13') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const idx = top.findIndex(t => t.repo.split('/')[0] === 'ugmoddev');
  console.log(`${s.hour}  rank=${idx === -1 ? 'NOT IN TOP-15' : '#' + (idx + 1)}`);
}

console.log('\n=== (d) elad-cmd FULL TRACE (last 96h) ===');
const hourly4 = {};
for (const s of series) {
  hourly4[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'elad-cmd') hourly4[s.hour] += f.pushes;
  }
}
const el = Object.keys(hourly4).sort(cmp);
console.log(el.slice(-96).map(h => `${h.slice(5)}:${hourly4[h]}`).join('  '));

console.log('\n=== (e) Janfindl FULL TRACE (last 96h, morning-shift h6-h8?) ===');
const hourly5 = {};
for (const s of series) {
  hourly5[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'Janfindl') hourly5[s.hour] += f.pushes;
  }
}
const jf = Object.keys(hourly5).sort(cmp);
console.log(jf.slice(-96).map(h => `${h.slice(5)}:${hourly5[h]}`).join('  '));

console.log('\n=== (f) REAL-WORD DISGUISE TIER — twainswee / janbeoty / spl1ce / forgetpwd TRACES (last 96h) ===');
for (const who of ['twainswee', 'janbeoty', 'spl1ce', 'forgetpwd', 'ThatOneFrench', 'srjordan6']) {
  const tr = {};
  for (const s of series) {
    tr[s.hour] = 0;
    for (const f of (s.bot_watch || [])) {
      for (const a of (f.actor_names || [])) if (a === who) tr[s.hour] += f.pushes;
    }
  }
  const tk = Object.keys(tr).sort(cmp);
  console.log(`${who.padEnd(14)} ${tk.slice(-48).map(h => `${h.slice(11)}:${tr[h]}`).join(' ')}`);
}

console.log('\n=== (g) TOP FARMS h16-h18 (bot_watch top-6 per hour) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-16') < 0) continue;
  const bw = (s.bot_watch || []).slice(0, 6).map(f => `${f.repo}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  n=${(s.bot_watch || []).length}  ${bw}`);
}

console.log('\n=== (g) TOP-15 FARM ACTORS h16-h18 ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-16') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const names = top.slice(0, 15).map(t => t.repo.split('/')[0]);
  console.log(`${s.hour}  ${names.join(', ')}`);
}

console.log('\n=== (g) NEW ACTORS first_seen h16-h18 ===');
const namesByHour = {};
for (const [name, e] of Object.entries(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  const f = hrs[0];
  if (f && cmp(f, '2026-08-16-16') >= 0) (namesByHour[f] = namesByHour[f] || []).push(name);
}
for (const h of Object.keys(namesByHour).sort(cmp)) {
  console.log(`${h}  n=${namesByHour[h].length}  ${namesByHour[h].join(', ')}`);
}

console.log('\n=== BOTNET WATCH h13-h18 (persistent farms) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-13') < 0) continue;
  const bn = (s.botnet_watch || []).map(b => `${(b.name || b.repo).split('/')[0]}/${(b.name || b.repo).split('/')[1]}(seen ${b.hours_seen}h, ${b.pushes_per_hour || b.avg_pushes || '?'}/hr)`).join('  ');
  console.log(`${s.hour}  ${bn || '-'}`);
}

console.log('\n=== DEMOTIONS — all-time top 15 ===');
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 15);
console.log(demos.map(x => `${x.hour} ${x.demoted_total}`).join(' | '));
console.log('h16-h18 demotions:', ['2026-08-16-16','2026-08-16-17','2026-08-16-18'].map(k => { const s = series.find(x => x.hour === k); return s ? `${k.slice(11)}:${s.demoted_total}` : `${k.slice(11)}:MISSING`; }).join('  '));

console.log('\n=== LEDGER PERSISTENCE (key actors) ===');
for (const v of ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'ThatOneFrench', 'srjordan6', 'danialzivehdadr', 'loganfoxdale', 'forgetpwd', 'twainswee', 'spl1ce', 'janbeoty']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(18)} first:${(e.hours || [])[0] || '?'} last:${(e.hours || []).slice(-1)[0] || '?'} hours:${(e.hours || []).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(18)} NOT IN LEDGER`);
}

console.log('\n=== TOP-15 ACTORS OVERALL h16-h18 (most active, all events) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-16') < 0) continue;
  const ta = (s.top_actors || []).slice(0, 8).map(a => `${a.actor}(${a.events})`).join('  ');
  console.log(`${s.hour}  ${ta}`);
}
