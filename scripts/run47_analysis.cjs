// run47_analysis.cjs — h10-h12: NOON RITUAL DAY 7, FACTORY RE-ARM, OSCILLATION REGIME
// Questions from run 46's plan:
//  (a) NOON RITUAL DAY 7 = Aug17 h12 (loganfoxdale 6-day decay 312/351/183/227/119/109 -> day7?
//      + fresh h12 cohort = shared-scheduler confirmation)
//  (b) FACTORY RE-ARM: 39 minted h9, re-arm window 2-4h -> does the next magazine fire h10-h12?
//      mint->dip->breach watch
//  (c) OSCILLATION REGIME: does wave keep swinging around 50% or find a floor/ceiling?
//  (d) SPRAY RADAR baseline 2: DevZonayed persistence + count spray farms per hour
//  (e) zerotraceh1 retirement confirm (2nd full zero day?)
//  (f) bogdanstancu decay continues to zero?
//  (g) ugmoddev: off-radar confirmed or comeback?
//  (h) animal-lover12: verify ledger h8 sighting via archive probe
//  (i) HN: 49310247 alive 48h+? karma still 3 -> no posts
//  (j) ledger trajectory
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
console.log('\n=== (a) SPAM TRAJECTORY h0 -> END (oscillation regime: floor/ceiling test; record streak = 18) ===');
let prev = null;
for (const s of series.filter(x => cmp(x.hour, '2026-08-17-0') >= 0)) {
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

// ---- (b) MINTING (factory re-arm after 39-mint h9?) ----
console.log('\n=== (b) MINTING h16 -> END (factory re-arm after h9=39 near-silence?) ===');
console.log(series.filter(x => cmp(x.hour, '2026-08-16-16') >= 0).map(k => `${k.hour.slice(11)}:${batch[k.hour] || 0}(c${conf[k.hour] || 0})`).join('  '));

// helper: actor hourly trace
function trace(who, windowH) {
  const t = {};
  for (const s of series) {
    t[s.hour] = 0;
    for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === who) t[s.hour] += f.pushes;
  }
  const k = Object.keys(t).sort(cmp);
  return k.slice(-windowH).map(h => `${h.slice(5)}:${t[h]}`).join('  ');
}

// ---- (c) LOGANFOXDALE noon ritual DAY 7 ----
console.log('\n=== (c) loganfoxdale FULL TRACE (last 48h) + per-day h11/h12/h13 ===');
console.log(trace('loganfoxdale', 48));
const lf = {};
for (const s of series) {
  lf[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'loganfoxdale') lf[s.hour] += f.pushes;
}
const days = {};
for (const s of series) {
  const day = s.hour.slice(0, 10);
  if (/1[123]$/.test(s.hour)) {
    days[day] = days[day] || {};
    days[day][s.hour.slice(11)] = lf[s.hour] || 0;
  }
}
for (const d of Object.keys(days).sort()) console.log(`${d}  h11:${days[d]['11'] || 0}  h12:${days[d]['12'] || 0}  h13:${days[d]['13'] || 0}`);

// ---- (c2) H12 COHORT: actors whose ONLY activity is h12 (shared-scheduler test) ----
console.log('\n=== (c2) H12-ONLY COHORT Aug17 (shared-scheduler test: twainswee/spl1ce pattern) ===');
const h12only = {};
for (const s of series) {
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) {
    if (s.hour.endsWith('-12')) h12only[a] = (h12only[a] || 0) + f.pushes;
  }
}
// who pushed ONLY at h12 (no other hour in bot_watch)
const h12OnlyActors = [];
for (const [a, pushes] of Object.entries(h12only)) {
  let other = 0;
  for (const s of series) {
    if (s.hour.endsWith('-12')) continue;
    for (const f of (s.bot_watch || [])) for (const an of (f.actor_names || [])) if (an === a) other += f.pushes;
  }
  if (other === 0) h12OnlyActors.push([a, pushes]);
}
h12OnlyActors.sort((a, b) => b[1] - a[1]);
console.log(`h12-only actors (n=${h12OnlyActors.length}): ${h12OnlyActors.slice(0, 25).map(x => `${x[0]}(${x[1]})`).join(', ')}`);
// top-12 h12 pushes overall
const h12Top = Object.entries(h12only).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('h12 top-12 pushers:', h12Top.map(x => `${x[0]}(${x[1]})`).join('  '));

// ---- (d) SPRAY RADAR: known spray farms h10-h12 ----
console.log('\n=== (d) SPRAY FARMS h7-h12 (known: bogdanstancu / BailiffDisengage / hayesjonathan9829 / DevZonayed) ===');
for (const who of ['bogdanstancu1119-maker', 'BailiffDisengage', 'hayesjonathan9829', 'DevZonayed']) {
  const t = {};
  for (const s of series) {
    t[s.hour] = 0;
    for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === who) t[s.hour] += f.pushes;
  }
  const k = Object.keys(t).sort(cmp);
  console.log(`${who.padEnd(22)} ${k.slice(-12).map(h => `${h.slice(11)}:${t[h]}`).join(' ')}`);
}
console.log('\n=== (d) top_actors events h10-h12 for spray suspects ===');
for (const s of series.slice(-3)) {
  const parts = [];
  for (const who of ['bogdanstancu1119-maker', 'BailiffDisengage', 'hayesjonathan9829', 'DevZonayed', 's741dev', 'aerlansanat']) {
    const ta = (s.top_actors || []).find(a => a.actor === who);
    if (ta) parts.push(`${who}=${ta.events}`);
  }
  console.log(`${s.hour}  ${parts.join('  ') || '(none in top_actors)'}`);
}
console.log('\n=== (d) TOP-12 ACTORS h10-h12 ===');
for (const s of series.slice(-3)) {
  const ta = (s.top_actors || []).slice(0, 12).map(a => `${a.actor}(${a.events})`).join('  ');
  console.log(`${s.hour}  ${ta}`);
}
console.log('\n=== TOP FARMS h10-h12 (bot_watch top-6) ===');
for (const s of series.slice(-3)) {
  const bw = (s.bot_watch || []).slice(0, 6).map(f => `${f.repo}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  n=${(s.bot_watch || []).length}  ${bw}`);
}

// ---- (e) ZEROTRACEH1 ----
console.log('\n=== (e) zerotraceh1 FULL TRACE (last 120h, retirement watch) ===');
console.log(trace('zerotraceh1', 120));

// ---- (f) BOGDANSTANCU full trace ----
console.log('\n=== (f) bogdanstancu1119-maker FULL TRACE (last 96h) ===');
console.log(trace('bogdanstancu1119-maker', 96));

// ---- (g) ugmoddev + elad-cmd ----
console.log('\n=== (g) ugmoddev FULL TRACE (last 96h) ===');
console.log(trace('ugmoddev', 96));
console.log('\n=== (g) elad-cmd FULL TRACE (last 96h) ===');
console.log(trace('elad-cmd', 96));

// ---- (h) ANIMAL-LOVER12 ----
console.log('\n=== (h) animal-lover12 FULL TRACE (last 120h, 9+ day veteran?) ===');
console.log(trace('animal-lover12', 120));

// ---- NEW ACTORS ----
console.log('\n=== NEW ACTORS first_seen h10-h12 ===');
const namesByHour = {};
for (const [name, e] of Object.entries(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  const f = hrs[0];
  if (f && cmp(f, '2026-08-17-10') >= 0) (namesByHour[f] = namesByHour[f] || []).push(name);
}
for (const h of Object.keys(namesByHour).sort(cmp)) {
  const list = namesByHour[h];
  console.log(`${h}  n=${list.length}  ${list.join(', ')}`);
}

// ---- DEMOTIONS ----
console.log('\n=== DEMOTIONS — all-time top 15 ===');
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 15);
console.log(demos.map(x => `${x.hour} ${x.demoted_total}`).join(' | '));
console.log('h10-h12 demotions:', series.slice(-3).map(k => `${k.hour.slice(11)}:${k.demoted_total}`).join('  '));

// ---- LEDGER ----
console.log('\n=== LEDGER ===');
const nLed = Object.keys(ledger).length;
const nConf = Object.values(ledger).filter(e => e.confirmed).length;
console.log(`ledger entries: ${nLed} (confirmed ${nConf})  [run46: 27,332 / 25,716]`);
console.log('\n=== LEDGER PERSISTENCE (key actors) ===');
for (const v of ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'srjordan6', 'loganfoxdale', 'twainswee', 'spl1ce', 'reinatomait', 'yonghuy', 'nuanton', 'bogdanstancu1119-maker', 'animal-lover12', 'BailiffDisengage', 'hayesjonathan9829', 'DevZonayed', 'flintassemblyduel', 'Fueltricharge', 'SkinCorporal', 'SailorEnliven', 'contrerasjake7319', 's741dev', 'aerlansanat']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(22)} first:${(e.hours || [])[0] || '?'} last:${(e.hours || []).slice(-1)[0] || '?'} hours:${(e.hours || []).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(22)} NOT IN LEDGER`);
}

// ---- LAST 6 HOURS ----
console.log('\n=== LAST 6 HOURS EVENTS / REPOS ===');
for (const s of series.slice(-6)) console.log(`${s.hour}  events=${s.events}  repos=${s.repos_seen}  spam=${s.push_spam_pct}%`);
