// run45_analysis.cjs — h4-h6: LEAD-TIME RE-BREACH? JANFINDL DAY 3? FACTORY RE-ARM? H2-SHIFT COHORT?
// Questions from run 44's plan:
//  (a) LEAD-TIME TEST: 1,338 minted h3 -> re-breach expected h4-h6 (watch >=50%)
//  (b) Janfindl day-3 morning shift Aug17 h6-h8 (day1 105/76/90, day2 123/77/89)
//  (c) factory keep minting (magazine 5,626 pattern: re-arm 2-3h after collapse?) or stay spent
//  (d) zerotraceh1 continuation (cycler or one-night comeback?)
//  (e) h2-shift scheduler: reinatomait/yonghuy/nuanton reappear at h4-h6 or only h2? + new h2-only actors
//  (f) NOON RITUAL DAY 7 = Aug17 h12 (~2 runs away; loganfoxdale drip + h12 spike)
//  (g) bogdanstancu: archive-trace h4 (was pushing 04:09Z per API); spray-farm panel?
//  (h) ugmoddev/elad-cmd persistence
//  (i) HN: 49310247 alive 48h+? karma still 3?
//  (j) ledger decline 4th time? (26,413 -> ?)
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

// ---- (a) STREAK + TRAJECTORY ----
console.log('\n=== (a) SPAM TRAJECTORY h16 -> END (streak check; record = 18) ===');
let prev = null;
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

// ---- (c) MINTING ----
console.log('\n=== (c) MINTING h16 -> END (factory re-arm after 1,338?) ===');
console.log(series.filter(x => cmp(x.hour, '2026-08-16-16') >= 0).map(k => `${k.hour.slice(11)}:${batch[k.hour] || 0}(c${conf[k.hour] || 0})`).join('  '));

// ---- (b) JANFINDL ----
console.log('\n=== (b) Janfindl FULL TRACE (last 120h, morning shift h6-h8 day-3 test) ===');
const hourly5 = {};
for (const s of series) {
  hourly5[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'Janfindl') hourly5[s.hour] += f.pushes;
}
const jf = Object.keys(hourly5).sort(cmp);
console.log(jf.slice(-120).map(h => `${h.slice(5)}:${hourly5[h]}`).join('  '));
console.log('\nJanfindl per-day h6/h7/h8:');
const jdays = {};
for (const s of series) {
  const day = s.hour.slice(0, 10);
  if (/[678]$/.test(s.hour)) { jdays[day] = jdays[day] || {}; jdays[day][s.hour.slice(11)] = hourly5[s.hour] || 0; }
}
for (const d of Object.keys(jdays).sort()) console.log(`${d}  h6:${jdays[d]['6'] || 0}  h7:${jdays[d]['7'] || 0}  h8:${jdays[d]['8'] || 0}`);

// ---- (d) ZEROTRACEH1 ----
console.log('\n=== (d) zerotraceh1 FULL TRACE (last 120h, cycler or one-night?) ===');
const hourlyZ = {};
for (const s of series) {
  hourlyZ[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'zerotraceh1') hourlyZ[s.hour] += f.pushes;
}
const zk = Object.keys(hourlyZ).sort(cmp);
console.log(zk.slice(-120).map(h => `${h.slice(5)}:${hourlyZ[h]}`).join('  '));

// ---- (e) H2-SHIFT SCHEDULER ----
console.log('\n=== (e) h2-shift trio: reinatomait / yonghuy / nuanton (any presence h4-h6?) ===');
for (const who of ['reinatomait', 'yonghuy', 'nuanton']) {
  const tr = {};
  for (const s of series) {
    tr[s.hour] = 0;
    for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === who) tr[s.hour] += f.pushes;
  }
  const tk = Object.keys(tr).sort(cmp);
  console.log(`${who.padEnd(12)} ${tk.slice(-24).map(h => `${h.slice(11)}:${tr[h]}`).join(' ')}`);
}
console.log('\n=== (e) actors with activity ONLY at h2 (scheduler mirror of h12 cohort) ===');
const hourly = {};
for (const s of series) {
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) {
      hourly[a] = hourly[a] || {};
      hourly[a][s.hour] = (hourly[a][s.hour] || 0) + f.pushes;
    }
  }
}
const h2only = [];
for (const [a, hrs] of Object.entries(hourly)) {
  const hs = Object.keys(hrs).sort(cmp);
  if (hs.length === 0) continue;
  const allAt2 = hs.every(h => h.slice(11) === '2');
  if (allAt2) h2only.push([a, hs.length, hs.map(h => `${h.slice(5)}:${hrs[h]}`).join(' ')]);
}
h2only.sort((a, b) => b[1] - a[1]);
console.log(`actors with ALL activity at h2 (n=${h2only.length}):`);
for (const [a, n, tr] of h2only) console.log(`  ${a.padEnd(22)} hours=${n}  ${tr}`);
// h2 aggregate farm push volume vs h1/h3
console.log('\n=== (e) h2 PUSH VOLUME vs h1/h3 (all days) ===');
const vol = {};
for (const s of series) {
  const h = s.hour.slice(11);
  if (['1', '2', '3'].includes(h)) {
    vol[h] = vol[h] || 0;
    for (const f of (s.bot_watch || [])) vol[h] += f.pushes;
  }
}
console.log(`total farm pushes  h1:${vol['1'] || 0}  h2:${vol['2'] || 0}  h3:${vol['3'] || 0}`);

// ---- (f) LOGANFOXDALE noon ritual ----
console.log('\n=== (f) loganfoxdale FULL TRACE (last 48h) + per-day h11/h12/h13 ===');
const lf = {};
for (const s of series) {
  lf[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'loganfoxdale') lf[s.hour] += f.pushes;
}
const lk = Object.keys(lf).sort(cmp);
console.log(lk.slice(-48).map(h => `${h.slice(5)}:${lf[h]}`).join('  '));
const days = {};
for (const s of series) {
  const day = s.hour.slice(0, 10);
  if (/1[123]$/.test(s.hour)) {
    days[day] = days[day] || {};
    days[day][s.hour.slice(11)] = lf[s.hour] || 0;
  }
}
for (const d of Object.keys(days).sort()) console.log(`${d}  h11:${days[d]['11'] || 0}  h12:${days[d]['12'] || 0}  h13:${days[d]['13'] || 0}`);

// ---- (g) BOGDANSTANCU ----
console.log('\n=== (g) bogdanstancu1119-maker FULL TRACE (last 96h, push-spray farm) ===');
const hourlyB = {};
for (const s of series) {
  hourlyB[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'bogdanstancu1119-maker') hourlyB[s.hour] += f.pushes;
}
const bk = Object.keys(hourlyB).sort(cmp);
console.log(bk.slice(-96).map(h => `${h.slice(5)}:${hourlyB[h]}`).join('  '));
console.log('bogdan top_actors events h4-h6:');
for (const s of series.slice(-3)) {
  const ta = (s.top_actors || []).find(a => a.actor === 'bogdanstancu1119-maker');
  console.log(`${s.hour}  events:${ta ? ta.events : 0}`);
}

// ---- (h) ugmoddev + elad-cmd ----
console.log('\n=== (h) ugmoddev FULL TRACE (last 96h) ===');
const hourly2 = {};
for (const s of series) {
  hourly2[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'ugmoddev') hourly2[s.hour] += f.pushes;
}
const uk = Object.keys(hourly2).sort(cmp);
console.log(uk.slice(-96).map(h => `${h.slice(5)}:${hourly2[h]}`).join('  '));
console.log('\n=== (h) elad-cmd FULL TRACE (last 96h) ===');
const hourly4 = {};
for (const s of series) {
  hourly4[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'elad-cmd') hourly4[s.hour] += f.pushes;
}
const el = Object.keys(hourly4).sort(cmp);
console.log(el.slice(-96).map(h => `${h.slice(5)}:${hourly4[h]}`).join('  '));

// ---- TOP FARMS + ACTORS h4-h6 ----
console.log('\n=== TOP FARMS h4-h6 (bot_watch top-6) ===');
for (const s of series.slice(-3)) {
  const bw = (s.bot_watch || []).slice(0, 6).map(f => `${f.repo}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  n=${(s.bot_watch || []).length}  ${bw}`);
}
console.log('\n=== TOP-15 ACTORS h4-h6 ===');
for (const s of series.slice(-3)) {
  const ta = (s.top_actors || []).slice(0, 12).map(a => `${a.actor}(${a.events})`).join('  ');
  console.log(`${s.hour}  ${ta}`);
}

// ---- NEW ACTORS ----
console.log('\n=== NEW ACTORS first_seen h4-h6 ===');
const namesByHour = {};
for (const [name, e] of Object.entries(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  const f = hrs[0];
  if (f && cmp(f, '2026-08-17-4') >= 0) (namesByHour[f] = namesByHour[f] || []).push(name);
}
for (const h of Object.keys(namesByHour).sort(cmp)) {
  console.log(`${h}  n=${namesByHour[h].length}  ${namesByHour[h].join(', ')}`);
}

// ---- DEMOTIONS ----
console.log('\n=== DEMOTIONS — all-time top 15 ===');
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 15);
console.log(demos.map(x => `${x.hour} ${x.demoted_total}`).join(' | '));
console.log('h4-h6 demotions:', series.slice(-3).map(k => `${k.hour.slice(11)}:${k.demoted_total}`).join('  '));

// ---- LEDGER ----
console.log('\n=== LEDGER ===');
const nLed = Object.keys(ledger).length;
const nConf = Object.values(ledger).filter(e => e.confirmed).length;
console.log(`ledger entries: ${nLed} (confirmed ${nConf})  [run44: 26,413 / 23,414]`);
console.log('\n=== LEDGER PERSISTENCE (key actors) ===');
for (const v of ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'srjordan6', 'loganfoxdale', 'twainswee', 'spl1ce', 'reinatomait', 'yonghuy', 'nuanton', 'bogdanstancu1119-maker', 'animal-lover12', 'flintassemblyduel', 'Fueltricharge', 'SkinCorporal', 'SailorEnliven', 'contrerasjake7319']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(22)} first:${(e.hours || [])[0] || '?'} last:${(e.hours || []).slice(-1)[0] || '?'} hours:${(e.hours || []).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(22)} NOT IN LEDGER`);
}

// ---- LAST 6 HOURS ----
console.log('\n=== LAST 6 HOURS EVENTS / REPOS ===');
for (const s of series.slice(-6)) console.log(`${s.hour}  events=${s.events}  repos=${s.repos_seen}  spam=${s.push_spam_pct}%`);
