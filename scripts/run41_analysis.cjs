// run41_analysis.cjs — h13-h15: POST-PEAK WAVE? NOON RITUAL CHECK? VETERAN SHIFTS?
// Questions from run 40's plan:
//  (a) wave after PEAK (collapse/plateau/re-breach); factory re-arm 214/449/440?
//  (b) loganfoxdale/d3 noon ritual — silent h13-h15 (h12-only)?
//  (c) ugmoddev full fade or re-ramp into top-15?
//  (d) Janfindl morning-shift return?
//  (e) elad-cmd next shift
//  (f) real-word disguise tier persistence (forgetpwd, twainswee, spl1ce)
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

console.log('\n=== (a) SPAM TRAJECTORY h8 -> h15 Aug16 (post-PEAK check) ===');
let prev = null;
for (const s of series.filter(x => cmp(x.hour, '2026-08-16-8') >= 0 && cmp(x.hour, '2026-08-16-15') <= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (a) MINTING h9 -> h15 (factory re-arm 214/449/440 -> next magazine?) ===');
const mintKeys = ['2026-08-16-9','2026-08-16-10','2026-08-16-11','2026-08-16-12','2026-08-16-13','2026-08-16-14','2026-08-16-15'];
console.log(mintKeys.map(k => `${k.slice(11)}:${batch[k] || 0}(c${conf[k] || 0})`).join('  '));

console.log('\n=== (a) BREACH STREAK (full history) ===');
let run = 0, curEnd = '';
for (const s of series) { if (s.push_spam_pct >= 50) { run++; curEnd = s.hour; } else run = 0; }
console.log(`current streak: ${run} consecutive hours ending ${curEnd}`);
const allBreaches = series.filter(s => s.push_spam_pct >= 50).map(s => s.hour);
console.log(`total >=50% hours: ${allBreaches.length}/${series.length}; last 18: ${allBreaches.slice(-18).join(', ')}`);

console.log('\n=== ALL-TIME EXTREMES ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 10);
console.log('highest 10:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

// hourly actor rates from bot_watch
const hourly = {};
for (const s of series) {
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
}
const hseq = Object.keys(hourly).sort(cmp);

console.log('\n=== (b) THE NOON RITUAL — loganfoxdale FULL TRACE (all 136h) ===');
const lf = {};
for (const s of series) {
  lf[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'loganfoxdale') lf[s.hour] += f.pushes;
  }
}
const lk = Object.keys(lf).sort(cmp);
console.log(lk.slice(-96).map(h => `${h.slice(5)}:${lf[h]}`).join('  '));

console.log('\n=== (b) NOON RITUAL — per-day hour-12 loganfoxdale rates (last 8 days) ===');
const days = {};
for (const s of series) {
  const day = s.hour.slice(0, 10);
  if (/12$/.test(s.hour) || /11$/.test(s.hour) || /13$/.test(s.hour)) {
    days[day] = days[day] || {};
    days[day][s.hour.slice(11)] = lf[s.hour] || 0;
  }
}
for (const d of Object.keys(days).sort()) {
  console.log(`${d}  h11:${days[d]['11'] || 0}  h12:${days[d]['12'] || 0}  h13:${days[d]['13'] || 0}`);
}

console.log('\n=== (c) ugmoddev FULL TRACE (last 72h) ===');
const hourly2 = {};
for (const s of series) {
  hourly2[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'ugmoddev') hourly2[s.hour] += f.pushes;
  }
}
const uk = Object.keys(hourly2).sort(cmp);
console.log(uk.slice(-72).map(h => `${h.slice(5)}:${hourly2[h]}`).join('  '));

console.log('\n=== (c) ugmoddev in top-15 farm list h13-h15? ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-13') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const idx = top.findIndex(t => t.repo.split('/')[0] === 'ugmoddev');
  console.log(`${s.hour}  rank=${idx === -1 ? 'NOT IN TOP-15' : '#' + (idx + 1)}`);
}

console.log('\n=== (d) Janfindl FULL TRACE (last 72h, morning-shift return?) ===');
const hourly5 = {};
for (const s of series) {
  hourly5[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'Janfindl') hourly5[s.hour] += f.pushes;
  }
}
const jf = Object.keys(hourly5).sort(cmp);
console.log(jf.slice(-72).map(h => `${h.slice(5)}:${hourly5[h]}`).join('  '));

console.log('\n=== (e) elad-cmd FULL TRACE (last 72h) ===');
const hourly4 = {};
for (const s of series) {
  hourly4[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'elad-cmd') hourly4[s.hour] += f.pushes;
  }
}
const el = Object.keys(hourly4).sort(cmp);
console.log(el.slice(-72).map(h => `${h.slice(5)}:${hourly4[h]}`).join('  '));

console.log('\n=== (e) TOP FARMS h13-h15 (bot_watch top-6 per hour) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-13') < 0) continue;
  const bw = (s.bot_watch || []).slice(0, 6).map(f => `${f.repo}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  n=${(s.bot_watch || []).length}  ${bw}`);
}

console.log('\n=== (f) REAL-WORD DISGUISE TIER h13-h15 (top-15 farm actors) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-13') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const names = top.slice(0, 15).map(t => t.repo.split('/')[0]);
  console.log(`${s.hour}  ${names.join(', ')}`);
}

console.log('\n=== (f) NEW ACTOR CHECK h13-h15 — full ledger first_seen ===');
const seen = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  const f = hrs[0];
  if (f && cmp(f, '2026-08-16-13') >= 0) seen[f] = seen[f] || [];
}
// fill actual names
const namesByHour = {};
for (const [name, e] of Object.entries(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  const f = hrs[0];
  if (f && cmp(f, '2026-08-16-13') >= 0) {
    (namesByHour[f] = namesByHour[f] || []).push(name);
  }
}
for (const h of Object.keys(namesByHour).sort(cmp)) {
  console.log(`${h}  n=${namesByHour[h].length}  ${namesByHour[h].join(', ')}`);
}

console.log('\n=== BOTNET WATCH h13-h15 (persistent 11h+ farms) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-13') < 0) continue;
  const bn = (s.botnet_watch || []).map(b => `${(b.name || b.repo).split('/')[0]}/${(b.name || b.repo).split('/')[1]}(seen ${b.hours_seen}h, ${b.pushes_per_hour || b.avg_pushes || '?'}/hr)`).join('  ');
  console.log(`${s.hour}  ${bn || '-'}`);
}

console.log('\n=== DEMOTIONS — all-time top 12 ===');
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 12);
console.log(demos.map(x => `${x.hour} ${x.demoted_total}`).join(' | '));

console.log('\n=== LEDGER PERSISTENCE (key actors) ===');
for (const v of ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'ThatOneFrench', 'srjordan6', 'danialzivehdadr', 'loganfoxdale', 'forgetpwd', 'twainswee', 'spl1ce', 'janbeoty']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(18)} first:${(e.hours || [])[0] || '?'} last:${(e.hours || []).slice(-1)[0] || '?'} hours:${(e.hours || []).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(18)} NOT IN LEDGER`);
}

// wave state from digest
try {
  const digest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', 'digest.json'), 'utf8'));
  console.log('\n=== DIGEST (latest) ===');
  console.log(JSON.stringify(digest, null, 1).slice(0, 700));
} catch (e) { console.log('digest read failed:', e.message); }
