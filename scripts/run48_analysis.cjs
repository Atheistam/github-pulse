// run48_analysis.cjs — h13-h15: THE BIG TEST (mint->dip->breach after h12 356-mint?)
// Questions from run 47's plan:
//  (a) THE BIG TEST - does h13-h15 breach >=50% like Aug 14 (2,002 mint -> h13 22.5% low -> h14 55.2%)?
//      Or does the wave find a new floor ~20-25% (structural collapse)?
//  (b) EVENTS RECOVERY: bounce toward ~150K/hr norm (farm-driven) or stay ~80K (collapse)?
//  (c) loganfoxdale negative window: ZERO at h13-h15 confirms noon-only again (day 8 next window)
//  (d) factory continuation: minting after 356? re-arm magazine or one-shot?
//  (e) elad-cmd: return after 6h+ gap or retirement?
//  (f) zerotraceh1 3rd zero day?
//  (g) ugmoddev fade to zero or rebound?
//  (h) bogdanstancu persistence as sole spray farm (h15 showed 592/hr!)
//  (i) HN: 49310247 alive 52h+? karma still 3 -> no posts
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

// ---- (a) TRAJECTORY h0 -> END ----
console.log('\n=== (a) SPAM TRAJECTORY h0 -> END (THE BIG TEST: mint->dip->breach after h12 356-mint?) ===');
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

// ---- (b) MINTING ----
console.log('\n=== (b) MINTING h10 -> END (factory after 356 at h12: magazine or one-shot?) ===');
console.log(series.filter(x => cmp(x.hour, '2026-08-17-10') >= 0).map(k => `${k.hour.slice(11)}:${batch[k.hour] || 0}(c${conf[k.hour] || 0})`).join('  '));

// ---- (b2) EVENTS RECOVERY: h13-h15 vs 7-day norm for those hours ----
console.log('\n=== (b2) EVENTS RECOVERY: h13-h15 vs 7-day same-hour norm (farm-driven bounce or collapse?) ===');
const days7 = series.filter(s => cmp(s.hour, '2026-08-10-0') >= 0 && cmp(s.hour, '2026-08-17-13') < 0);
for (const h of ['13', '14', '15']) {
  const same = days7.filter(s => s.hour.endsWith('-' + h));
  const avg = same.reduce((a, s) => a + s.events, 0) / same.length;
  const cur = series.find(s => s.hour === '2026-08-17-' + h);
  console.log(`h${h}: 7-day avg=${Math.round(avg)}  actual=${cur ? cur.events : 'MISSING'}  ${cur ? `(${((cur.events / avg - 1) * 100).toFixed(0)}% vs norm)` : ''}`);
}

// ---- (b3) FARM PUSH VOLUME per hour (standing-army strength) ----
console.log('\n=== (b3) FARM PUSH VOLUME (sum bot_watch pushes/hr, last 12h) ===');
for (const s of series.slice(-12)) {
  const vol = (s.bot_watch || []).reduce((a, f) => a + f.pushes, 0);
  console.log(`${s.hour}  farm_pushes=${vol}  n_farms=${(s.bot_watch || []).length}`);
}

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

// ---- (c) LOGANFOXDALE noon ritual: negative window h13-h15 ----
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

// ---- (c2) H12-ONLY COHORT recheck with h13-h15 now included (leak test) ----
console.log('\n=== (c2) H12-ONLY COHORT Aug17 (recheck w/ h13-h15: did the noon cohort leak?) ===');
const h12only = {};
for (const s of series) {
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) {
    if (s.hour.endsWith('-12')) h12only[a] = (h12only[a] || 0) + f.pushes;
  }
}
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
console.log(`h12-only actors (n=${h12OnlyActors.length}): ${h12OnlyActors.slice(0, 15).map(x => `${x[0]}(${x[1]})`).join(', ')}`);
const h12Top = Object.entries(h12only).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('h12 top-12 pushers:', h12Top.map(x => `${x[0]}(${x[1]})`).join('  '));

// ---- (d) SPRAY FARMS h13-h15 ----
console.log('\n=== (d) SPRAY FARMS h13-h15 (bogdanstancu h15 = 592/hr?) ===');
for (const who of ['bogdanstancu1119-maker', 'BailiffDisengage', 'hayesjonathan9829', 'DevZonayed', 'animal-lover12']) {
  const t = {};
  for (const s of series) {
    t[s.hour] = 0;
    for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === who) t[s.hour] += f.pushes;
  }
  const k = Object.keys(t).sort(cmp);
  console.log(`${who.padEnd(22)} ${k.slice(-12).map(h => `${h.slice(11)}:${t[h]}`).join(' ')}`);
}
console.log('\n=== (d) TOP-12 ACTORS h13-h15 ===');
for (const s of series.slice(-3)) {
  const ta = (s.top_actors || []).slice(0, 12).map(a => `${a.actor}(${a.events})`).join('  ');
  console.log(`${s.hour}  ${ta}`);
}
console.log('\n=== TOP FARMS h13-h15 (bot_watch top-6) ===');
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

// ---- NEW ACTORS ----
console.log('\n=== NEW ACTORS first_seen h13-h15 ===');
const namesByHour = {};
for (const [name, e] of Object.entries(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  const f = hrs[0];
  if (f && cmp(f, '2026-08-17-13') >= 0) (namesByHour[f] = namesByHour[f] || []).push(name);
}
for (const h of Object.keys(namesByHour).sort(cmp)) {
  const list = namesByHour[h];
  console.log(`${h}  n=${list.length}  ${list.join(', ')}`);
}

// ---- DEMOTIONS ----
console.log('\n=== DEMOTIONS — all-time top 15 ===');
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 15);
console.log(demos.map(x => `${x.hour} ${x.demoted_total}`).join(' | '));
console.log('h13-h15 demotions:', series.slice(-3).map(k => `${k.hour.slice(11)}:${k.demoted_total}`).join('  '));

// ---- LEDGER ----
console.log('\n=== LEDGER ===');
const nLed = Object.keys(ledger).length;
const nConf = Object.values(ledger).filter(e => e.confirmed).length;
console.log(`ledger entries: ${nLed} (confirmed ${nConf})  [run47: 26,890 / 25,027]`);
console.log('\n=== LEDGER PERSISTENCE (key actors) ===');
for (const v of ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'srjordan6', 'loganfoxdale', 'twainswee', 'spl1ce', 'reinatomait', 'yonghuy', 'nuanton', 'bogdanstancu1119-maker', 'animal-lover12', 'BailiffDisengage', 'hayesjonathan9829', 'DevZonayed', 'flintassemblyduel', 'Fueltricharge', 'SkinCorporal', 'SailorEnliven', 'contrerasjake7319', 's741dev', 'aerlansanat']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(22)} first:${(e.hours || [])[0] || '?'} last:${(e.hours || []).slice(-1)[0] || '?'} hours:${(e.hours || []).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(22)} NOT IN LEDGER`);
}

// ---- LAST 6 HOURS ----
console.log('\n=== LAST 6 HOURS EVENTS / REPOS ===');
for (const s of series.slice(-6)) console.log(`${s.hour}  events=${s.events}  repos=${s.repos_seen}  spam=${s.push_spam_pct}%`);
