// run43_analysis.cjs — h19-h0: RECORD BREAK OR COLLAPSE? FACTORY RE-ARM? NOON SCHEDULER FOOTPRINT?
// Questions from run 42's plan:
//  (a) 10-hour >=50% streak -> 11-16 (RECORD BREAK) or collapse?
//  (b) factory re-arm or continued silence (64/hr floor?)
//  (c) noon ritual — off-window h19-h0 (day 7 test = Aug 17 h12, ~4 runs away)
//  (d) twainswee/spl1ce h12 double — OTHER actors firing at h12 only (scheduler footprint)?
//  (e) Janfindl — morning shift day 2 done; any off-window h19-h0 activity?
//  (f) ugmoddev noti-api-server ramp or fade; zombie shifts
//  (g) elad-cmd shift gaps
//  (h) ledger decline continues? (was 27,289 -> 27,289 run42; -1,864 first-ever decline)
//  (i) demotions h19-h0; new actors + disguise templates
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

// ---- (a) STREAK ----
console.log('\n=== (a) SPAM TRAJECTORY h16 -> END (streak check; record = 10) ===');
let prev = null;
let streak = 0, streakEnd = '';
for (const s of series) { if (s.push_spam_pct >= 50) { streak++; streakEnd = s.hour; } else streak = 0; }
console.log(`CURRENT >=50% STREAK: ${streak} hours ending ${streakEnd} (all-time record: 10)`);
for (const s of series.filter(x => cmp(x.hour, '2026-08-16-16') >= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : '  <-- SUB-50%';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (a) ALL-TIME >=50% STREAKS (top 6) ===');
let runs = [], cur = 0, start = '';
for (const s of series) {
  if (s.push_spam_pct >= 50) { if (cur === 0) start = s.hour; cur++; }
  else { if (cur > 0) runs.push([start, series[series.indexOf(s) - 1].hour, cur]); cur = 0; }
}
if (cur > 0) runs.push([start, series[series.length - 1].hour, cur]);
runs.sort((a, b) => b[2] - a[2]);
console.log(runs.slice(0, 6).map(r => `${r[2]}h: ${r[0]} -> ${r[1]}`).join(' | '));

console.log('\n=== (a) MINTING h16 -> END (factory quiet? 64/hr floor?) ===');
console.log(series.filter(x => cmp(x.hour, '2026-08-16-16') >= 0).map(k => `${k.hour.slice(11)}:${batch[k.hour] || 0}(c${conf[k.hour] || 0})`).join('  '));

// ---- (d) NOON SCHEDULER FOOTPRINT ----
console.log('\n=== (d) NOON SCHEDULER FOOTPRINT — actors whose activity is confined to h12 ===');
const hourly = {};
for (const s of series) {
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) {
      hourly[a] = hourly[a] || {};
      hourly[a][s.hour] = (hourly[a][s.hour] || 0) + f.pushes;
    }
  }
}
const h12only = [];
for (const [a, hrs] of Object.entries(hourly)) {
  const hs = Object.keys(hrs).sort(cmp);
  if (hs.length === 0) continue;
  const days = new Set(hs.map(h => h.slice(0, 10)));
  const allAt12 = hs.every(h => h.slice(11) === '12');
  if (allAt12 && days.size >= 1) h12only.push([a, hs.length, days.size, hs.map(h => `${h.slice(5)}:${hrs[h]}`).join(' ')]);
}
h12only.sort((a, b) => b[1] - a[1]);
console.log(`actors with ALL activity at h12 (n=${h12only.length}):`);
for (const [a, n, d, tr] of h12only) console.log(`  ${a.padEnd(22)} hours=${n} days=${d}  ${tr}`);

// h12 aggregate push volume vs neighbors (last 4 days)
console.log('\n=== (d) h12 PUSH VOLUME vs h11/h13 (all days in history) ===');
const vol = {};
for (const s of series) {
  const h = s.hour.slice(11);
  if (['11', '12', '13'].includes(h)) {
    vol[h] = vol[h] || 0;
    for (const f of (s.bot_watch || [])) vol[h] += f.pushes;
  }
}
console.log(`total farm pushes  h11:${vol['11'] || 0}  h12:${vol['12'] || 0}  h13:${vol['13'] || 0}`);

// ---- (c) THE NOON RITUAL — loganfoxdale ----
console.log('\n=== (c) loganfoxdale FULL TRACE (last 96h) ===');
const lf = {};
for (const s of series) {
  lf[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'loganfoxdale') lf[s.hour] += f.pushes;
}
const lk = Object.keys(lf).sort(cmp);
console.log(lk.slice(-96).map(h => `${h.slice(5)}:${lf[h]}`).join('  '));

console.log('\n=== (c) NOON RITUAL — per-day h11/h12/h13 loganfoxdale ===');
const days = {};
for (const s of series) {
  const day = s.hour.slice(0, 10);
  if (/1[123]$/.test(s.hour)) {
    days[day] = days[day] || {};
    days[day][s.hour.slice(11)] = lf[s.hour] || 0;
  }
}
for (const d of Object.keys(days).sort()) console.log(`${d}  h11:${days[d]['11'] || 0}  h12:${days[d]['12'] || 0}  h13:${days[d]['13'] || 0}`);

// ---- (f) ugmoddev ----
console.log('\n=== (f) ugmoddev FULL TRACE (last 96h) ===');
const hourly2 = {};
for (const s of series) {
  hourly2[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'ugmoddev') hourly2[s.hour] += f.pushes;
}
const uk = Object.keys(hourly2).sort(cmp);
console.log(uk.slice(-96).map(h => `${h.slice(5)}:${hourly2[h]}`).join('  '));

console.log('\n=== (f) ugmoddev REPOS per hour h16 -> END ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-16') < 0) continue;
  const repos = (s.bot_watch || []).filter(f => (f.actor_names || []).includes('ugmoddev')).map(f => `${f.repo.split('/')[1]}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  ${repos || '-'}`);
}

// ---- (g) elad-cmd ----
console.log('\n=== (g) elad-cmd FULL TRACE (last 96h, shift gaps?) ===');
const hourly4 = {};
for (const s of series) {
  hourly4[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'elad-cmd') hourly4[s.hour] += f.pushes;
}
const el = Object.keys(hourly4).sort(cmp);
console.log(el.slice(-96).map(h => `${h.slice(5)}:${hourly4[h]}`).join('  '));

// ---- (e) Janfindl ----
console.log('\n=== (e) Janfindl FULL TRACE (last 96h, morning shift h6-h8) ===');
const hourly5 = {};
for (const s of series) {
  hourly5[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'Janfindl') hourly5[s.hour] += f.pushes;
}
const jf = Object.keys(hourly5).sort(cmp);
console.log(jf.slice(-96).map(h => `${h.slice(5)}:${hourly5[h]}`).join('  '));

// ---- REAL-WORD DISGUISE TIER traces ----
console.log('\n=== REAL-WORD DISGUISE TRACES (last 48h) ===');
for (const who of ['twainswee', 'spl1ce', 'janbeoty', 'forgetpwd', 'ThatOneFrench', 'srjordan6', 'danialzivehdadr']) {
  const tr = {};
  for (const s of series) {
    tr[s.hour] = 0;
    for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === who) tr[s.hour] += f.pushes;
  }
  const tk = Object.keys(tr).sort(cmp);
  console.log(`${who.padEnd(14)} ${tk.slice(-48).map(h => `${h.slice(11)}:${tr[h]}`).join(' ')}`);
}

// ---- TOP FARMS ----
console.log('\n=== TOP FARMS h16 -> END (bot_watch top-6 per hour) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-16') < 0) continue;
  const bw = (s.bot_watch || []).slice(0, 6).map(f => `${f.repo}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  n=${(s.bot_watch || []).length}  ${bw}`);
}

console.log('\n=== TOP-15 FARM ACTORS h16 -> END ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-16') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const names = top.slice(0, 15).map(t => t.repo.split('/')[0]);
  console.log(`${s.hour}  ${names.join(', ')}`);
}

// ---- NEW ACTORS ----
console.log('\n=== NEW ACTORS first_seen h16 -> END ===');
const namesByHour = {};
for (const [name, e] of Object.entries(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  const f = hrs[0];
  if (f && cmp(f, '2026-08-16-16') >= 0) (namesByHour[f] = namesByHour[f] || []).push(name);
}
for (const h of Object.keys(namesByHour).sort(cmp)) {
  console.log(`${h}  n=${namesByHour[h].length}  ${namesByHour[h].join(', ')}`);
}

// ---- BOTNET WATCH ----
console.log('\n=== BOTNET WATCH h16 -> END ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-16') < 0) continue;
  const bn = (s.botnet_watch || []).map(b => `${(b.repo || b.name || '?').split('/')[0]}/${(b.repo || b.name || '?').split('/')[1]}(seen ${b.hours_seen}h, ${b.pushes_per_hour || b.avg_pushes || '?'}/hr)`).join('  ');
  console.log(`${s.hour}  ${bn || '-'}`);
}

// ---- DEMOTIONS ----
console.log('\n=== DEMOTIONS — all-time top 15 ===');
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 15);
console.log(demos.map(x => `${x.hour} ${x.demoted_total}`).join(' | '));
console.log('h16-end demotions:', series.filter(x => cmp(x.hour, '2026-08-16-16') >= 0).map(k => `${k.hour.slice(11)}:${k.demoted_total}`).join('  '));

// ---- LEDGER ----
console.log('\n=== LEDGER ===');
const nLed = Object.keys(ledger).length;
const nConf = Object.values(ledger).filter(e => e.confirmed).length;
console.log(`ledger entries: ${nLed} (confirmed ${nConf})  [run42: 27,289 total / 25,515 confirmed]`);
console.log('\n=== LEDGER PERSISTENCE (key actors) ===');
for (const v of ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'ThatOneFrench', 'srjordan6', 'danialzivehdadr', 'loganfoxdale', 'forgetpwd', 'twainswee', 'spl1ce', 'janbeoty', 'm-anderson1596', 'harringtonkevin8169']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(18)} first:${(e.hours || [])[0] || '?'} last:${(e.hours || []).slice(-1)[0] || '?'} hours:${(e.hours || []).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(18)} NOT IN LEDGER`);
}

console.log('\n=== TOP-15 ACTORS OVERALL h16 -> END (all events) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-16') < 0) continue;
  const ta = (s.top_actors || []).slice(0, 8).map(a => `${a.actor}(${a.events})`).join('  ');
  console.log(`${s.hour}  ${ta}`);
}

console.log('\n=== LAST 6 HOURS EVENTS / REPOS ===');
for (const s of series.slice(-6)) console.log(`${s.hour}  events=${s.events}  repos=${s.repos_seen}  spam=${s.push_spam_pct}%`);
