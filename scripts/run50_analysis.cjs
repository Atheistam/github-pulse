// run50_analysis.cjs — h20(08-17) -> h10(08-18): 15h gap run (cron missed ~5 ticks)
// Questions:
//  (a) TRAJECTORY: h18 58.3 + h19 56.1 = 2 straight >=50% after incident -> siege forming or collapse?
//      Then the mysterious Aug18 h8-h10 event-volume dip (126K/105K/82K vs ~150K norm) -> new incident?
//  (b) MINTING: factory after the 1,605-magazine (h17): re-arm or spent? hourly batches h20->h10
//  (c) EVENTS vs 7-day norm: h20(08-17) -> h10(08-18) — recovery complete, or new dip?
//  (d) loganfoxdale: DAY-8 NOON = Aug18 h12 (NEXT run); negative window h20->h10 (leak check)
//  (e) zerotraceh1: 4th comeback (74 at h19) stable or one-night?
//  (f) bogdanstancu1119-maker: 256 rebound -> re-ramp or decay? (spray radar h9: 168)
//  (g) ugmoddev: 307 h16 -> 0/0/0 h17-h19: back or gone? elad-cmd: psycho-usage (146/hr at h10, seen 5h)
//  (h) h12-only cohort Aug17 (n=59): leak in h20-h10?
//  (i) ledger trajectory (25,742 -> ?)
//  (j) HN: 49310247 alive? karma?
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

// ---- (a) TRAJECTORY Aug17 h17 -> END ----
console.log('\n=== (a) SPAM TRAJECTORY 2026-08-17-17 -> END ===');
let prev = null;
for (const s of series.filter(x => cmp(x.hour, '2026-08-17-17') >= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : '  <-- SUB-50%';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (a2) ALL-TIME >=50% STREAKS (top 6) ===');
let runs = [], cur = 0, start = '';
for (const s of series) {
  if (s.push_spam_pct >= 50) { if (cur === 0) start = s.hour; cur++; }
  else { if (cur > 0) runs.push([start, series[series.indexOf(s) - 1].hour, cur]); cur = 0; }
}
if (cur > 0) runs.push([start, series[series.length - 1].hour, cur]);
runs.sort((a, b) => b[2] - a[2]);
console.log(runs.slice(0, 6).map(r => `${r[2]}h: ${r[0]} -> ${r[1]}`).join(' | '));

// ---- (b) MINTING ----
console.log('\n=== (b) MINTING h17 -> END (factory after 1,605 magazine: re-arm or spent?) ===');
console.log(series.filter(x => cmp(x.hour, '2026-08-17-17') >= 0).map(k => `${k.hour.slice(11)}:${batch[k.hour] || 0}(c${conf[k.hour] || 0})`).join('  '));

// ---- (c) EVENTS vs 7-day norm ----
console.log('\n=== (c) EVENTS h20 -> h10 vs 7-day same-hour norm ===');
const days7 = series.filter(s => cmp(s.hour, '2026-08-10-0') >= 0 && cmp(s.hour, '2026-08-17-20') < 0);
for (const h of ['20','21','22','23','0','1','2','3','4','5','6','7','8','9','10']) {
  const same = days7.filter(s => s.hour.endsWith('-' + h));
  const avg = same.reduce((a, s) => a + s.events, 0) / same.length;
  const cur = series.find(s => s.hour === '2026-08-18-' + h) || series.find(s => s.hour === '2026-08-17-' + h);
  console.log(`h${h}: 7-day avg=${Math.round(avg)}  actual=${cur ? cur.events : 'MISSING'}  ${cur ? `(${((cur.events / avg - 1) * 100).toFixed(0)}% vs norm)` : ''}`);
}

// ---- (c2) FARM PUSH VOLUME ----
console.log('\n=== (c2) FARM PUSH VOLUME (sum bot_watch pushes/hr, last 20h) ===');
for (const s of series.slice(-20)) {
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

// ---- (d) LOGANFOXDALE: negative window h20 -> h10 (day-8 noon = Aug18 h12, NEXT run) ----
console.log('\n=== (d) loganfoxdale FULL TRACE (last 60h) ===');
console.log(trace('loganfoxdale', 60));
const lf = {};
for (const s of series) {
  lf[s.hour] = 0;
  for (const f of (s.bot_watch || [])) for (const a of (f.actor_names || [])) if (a === 'loganfoxdale') lf[s.hour] += f.pushes;
}
const days = {};
for (const h of Object.keys(lf)) { const d = h.slice(0, 10); days[d] = days[d] || { h11: 0, h12: 0, h13: 0 }; if (h.endsWith('-11')) days[d].h11 += lf[h]; if (h.endsWith('-12')) days[d].h12 += lf[h]; if (h.endsWith('-13')) days[d].h13 += lf[h]; }
console.log('per-day h11/h12/h13:', Object.entries(days).map(([d, v]) => `${d} h11:${v.h11} h12:${v.h12} h13:${v.h13}`).join('  '));
const lfLeak = Object.entries(lf).filter(([h, v]) => cmp(h, '2026-08-17-20') >= 0 && v > 0);
console.log('loganfoxdale h20->h10 nonzero hours:', lfLeak.length ? lfLeak.map(([h, v]) => `${h}:${v}`).join('  ') : 'NONE (clean negative window)');

// ---- (e) zerotraceh1 ----
console.log('\n=== (e) zerotraceh1 TRACE (last 72h) ===');
console.log(trace('zerotraceh1', 72));

// ---- (f) bogdanstancu ----
console.log('\n=== (f) bogdanstancu1119-maker TRACE (last 40h) ===');
console.log(trace('bogdanstancu1119-maker', 40));

// ---- (g) ugmoddev / elad-cmd ----
console.log('\n=== (g) ugmoddev TRACE (last 48h) ===');
console.log(trace('ugmoddev', 48));
console.log('\n=== (g2) elad-cmd TRACE (last 48h) ===');
console.log(trace('elad-cmd', 48));

// ---- (h) h12-only cohort Aug17 leak check h20->h10 ----
console.log('\n=== (h) AUG17 h12-ONLY COHORT leak check h20 -> h10 ===');
// find actors whose ONLY activity in Aug17 was h12
const aug17 = series.filter(s => s.hour.startsWith('2026-08-17'));
const aug17Only = {};
for (const s of aug17) {
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) {
      const hh = s.hour.slice(11);
      if (!aug17Only[a]) aug17Only[a] = { hours: new Set(), total: 0 };
      aug17Only[a].hours.add(hh);
      aug17Only[a].total += f.pushes;
    }
  }
}
const h12only = Object.entries(aug17Only).filter(([a, v]) => v.hours.size === 1 && v.hours.has('12'));
console.log(`Aug17 h12-only actors: n=${h12only.length}`);
// now check their activity h20 -> h10
let leaks = [];
for (const [a, v] of h12only) {
  const t = {};
  for (const s of series.filter(x => cmp(x.hour, '2026-08-17-20') >= 0)) {
    t[s.hour] = 0;
    for (const f of (s.bot_watch || [])) for (const nm of (f.actor_names || [])) if (nm === a) t[s.hour] += f.pushes;
  }
  const nz = Object.entries(t).filter(([h, x]) => x > 0);
  if (nz.length) leaks.push([a, nz]);
}
console.log(leaks.length ? 'LEAKS: ' + JSON.stringify(leaks).slice(0, 1500) : 'NO LEAKS (all 59 stayed h12-only)');

// ---- (i) ledger ----
console.log('\n=== (i) LEDGER ===');
console.log(`ledger entries: ${Object.keys(ledger).length} (confirmed ${Object.values(ledger).filter(e => e.confirmed).length})  [run49: 25,742]`);

// ---- TOP-12 ACTORS + TOP FARMS h20 -> h10 ----
console.log('\n=== TOP-12 ACTORS h20 -> h10 ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-17-20') >= 0)) {
  console.log(`${s.hour}  ${(s.top_actors || []).slice(0, 12).map(a => `${a.actor}(${a.events})`).join('  ')}`);
}
console.log('\n=== TOP FARMS (bot_watch top-5) h20 -> h10 ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-17-20') >= 0)) {
  console.log(`${s.hour}  n=${(s.bot_watch || []).length}  ${(s.bot_watch || []).slice(0, 5).map(f => `${(f.actor_names || []).join('/')}/${f.repo}(${f.pushes})`).join('  ')}`);
}

// ---- NEW ACTORS first_seen h20 -> h10 (samples) ----
console.log('\n=== NEW ACTORS first_seen h20 -> h10 (first 40 each) ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-17-20') >= 0)) {
  const n = (s.new_actors || []).length;
  console.log(`${s.hour}  n=${n}  ${(s.new_actors || []).slice(0, 40).join(', ')}`);
}

// ---- DEMOTIONS all-time top 15 + h20->h10 ----
console.log('\n=== DEMOTIONS — all-time top 15 ===');
const demos = series.map(s => ({ hour: s.hour, d: s.demoted_total })).sort((a, b) => b.d - a.d).slice(0, 15);
console.log(demos.map(x => `${x.hour} ${x.d}`).join(' | '));
console.log('h20->h10 demotions:', series.filter(x => cmp(x.hour, '2026-08-17-20') >= 0).map(s => `${s.hour.slice(11)}:${s.demoted_total}`).join('  '));

// ---- botnet watch persistence ----
console.log('\n=== BOTNET WATCH h10 (5+ hr persistent) ===');
const h10 = series[series.length - 1];
console.log((h10.botnet_watch || h10.bot_watch || []).filter(f => f.hours_seen >= 5 || f.seen_hours >= 5).map(f => `${(f.actor_names || []).join('/')}/${f.repo}(${f.pushes}/hr, ${f.hours_seen || f.seen_hours}h)`).join('  ') || 'none');
