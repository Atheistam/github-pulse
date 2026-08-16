// run39_analysis.cjs — h7-h9: LEAD-TIME LIVE TEST #3 (2,521 mint h5+h6 -> re-spike?)
// Questions from run 38's plan:
//  (a) does the 2,521-mint (h5+h6) re-spike h7/h8 above the 52.7% hold?
//  (b) factory: keeps 1,000+/hr or did h6 1,553 peak?
//  (c) ugmoddev 95/hr: collapse or re-ramp?
//  (d) elad-cmd: shift returns when (off since h6)?
//  (e) Janfindl: one-shot return or new shift? zerotraceh1: 8h+ off = retired?
//  (f) ThatOneFrench: 5th hour - veteran confirmed?
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

console.log('\n=== (a) SPAM TRAJECTORY h1 -> h9 Aug16 (lead-time live test #3: 2,521 mint at h5+h6) ===');
let prev = null;
for (const s of series.filter(x => cmp(x.hour, '2026-08-16-1') >= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (b) MINTING h5 -> h9 Aug16 (factory keeps 1,000+/hr or h6 1,553 peak?) ===');
const mintKeys = ['2026-08-16-5','2026-08-16-6','2026-08-16-7','2026-08-16-8','2026-08-16-9'];
console.log(mintKeys.map(k => `${k.slice(11)}:${batch[k] || 0}(c${conf[k] || 0})`).join('  '));

console.log('\n=== (a) BREACH STREAK (full history) ===');
let run = 0, curEnd = '';
for (const s of series) { if (s.push_spam_pct >= 50) { run++; curEnd = s.hour; } else run = 0; }
console.log(`current streak: ${run} consecutive hours ending ${curEnd}`);
const allBreaches = series.filter(s => s.push_spam_pct >= 50).map(s => s.hour);
console.log(`total >=50% hours: ${allBreaches.length}/${series.length}; last 15: ${allBreaches.slice(-15).join(', ')}`);

console.log('\n=== ALL-TIME EXTREMES ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 10);
console.log('highest 10:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

// hourly actor rates h1 -> h9 from bot_watch
const hourly = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-1') < 0) continue;
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
}
const hseq = Object.keys(hourly).sort(cmp);

console.log('\n=== (c/d/e/f) VETERAN TRACE h1 -> h9 ===');
const vets = ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'ThatOneFrench', 'srjordan6', 'danialzivehdadr', 'winson-00178005', '2awillican988', 'rite83danil', 'nathydia', 'carroweimer', 'nskyei', 'toogeqmc'];
for (const v of vets) {
  const rates = hseq.map(h => `${h.slice(11)}:${hourly[h][v] || 0}`).join('  ');
  console.log(`${v.padEnd(18)} ${rates}`);
}

console.log('\n=== (c) ugmoddev DUAL-REPO trace h1 -> h9 ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-1') < 0) continue;
  const parts = [];
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'ugmoddev') parts.push(`${f.repo.split('/')[1]}:${f.pushes}`);
  }
  console.log(`${s.hour}  ${parts.join('  ') || '-'}`);
}

console.log('\n=== (d) elad-cmd FULL TRACE (shift return timing) ===');
const hourly4 = {};
for (const s of series) {
  hourly4[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'elad-cmd') hourly4[s.hour] += f.pushes;
  }
}
const el = Object.keys(hourly4).sort(cmp);
console.log(el.slice(-64).map(h => `${h.slice(5)}:${hourly4[h]}`).join('  '));

console.log('\n=== (e) Janfindl FULL TRACE (one-shot return or new shift?) ===');
const hourly5 = {};
for (const s of series) {
  hourly5[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'Janfindl') hourly5[s.hour] += f.pushes;
  }
}
const jf = Object.keys(hourly5).sort(cmp);
console.log(jf.slice(-56).map(h => `${h.slice(5)}:${hourly5[h]}`).join('  '));

console.log('\n=== (e) ThatOneFrench FULL TRACE (5th hour - veteran confirmed?) ===');
const hourly7 = {};
for (const s of series) {
  hourly7[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'ThatOneFrench') hourly7[s.hour] += f.pushes;
  }
}
const tof = Object.keys(hourly7).sort(cmp);
console.log(tof.slice(-30).map(h => `${h.slice(5)}:${hourly7[h]}`).join('  '));

console.log('\n=== (f) srjordan6 FULL TRACE (one-hit pattern) ===');
const hourly8 = {};
for (const s of series) {
  hourly8[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'srjordan6') hourly8[s.hour] += f.pushes;
  }
}
const sr = Object.keys(hourly8).sort(cmp);
console.log(sr.slice(-30).map(h => `${h.slice(5)}:${hourly8[h]}`).join('  '));

console.log('\n=== (e) zerotraceh1 FULL TRACE (8h+ off - retired or longest cycle?) ===');
const hourly3 = {};
for (const s of series) {
  hourly3[s.hour] = 0;
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) if (a === 'zerotraceh1') hourly3[s.hour] += f.pushes;
  }
}
const zt = Object.keys(hourly3).sort(cmp);
console.log(zt.slice(-56).map(h => `${h.slice(5)}:${hourly3[h]}`).join('  '));

console.log('\n=== (d) LEDGER PERSISTENCE (key actors) ===');
for (const v of ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'Janfindl', 'ThatOneFrench', 'srjordan6', 'danialzivehdadr']) {
  const e = ledger[v];
  if (e) console.log(`${v.padEnd(18)} first:${(e.hours||[])[0]||'?'} last:${(e.hours||[]).slice(-1)[0]||'?'} hours:${(e.hours||[]).length} confirmed:${e.confirmed}`);
  else console.log(`${v.padEnd(18)} NOT IN LEDGER`);
}

console.log('\n=== (e) NAMING TEMPLATES h7-h9 (top-15 farm actors) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-7') < 0) continue;
  const fp = s.farm_probe || {};
  const top = (fp.actors_1_2 && fp.actors_1_2.top) || [];
  const names = top.slice(0, 15).map(t => t.repo.split('/')[0]);
  console.log(`${s.hour}  ${names.join(', ')}`);
}

console.log('\n=== FARMS h7-h9 (bot_watch top-5 per hour) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-7') < 0) continue;
  const bw = (s.bot_watch || []).slice(0, 5).map(f => `${f.repo}(${f.pushes})`).join('  ');
  console.log(`${s.hour}  n=${(s.bot_watch||[]).length}  ${bw}`);
}

// botnet_watch (persistent 13h+ farms) h7-h9
console.log('\n=== BOTNET WATCH h7-h9 (persistent farms) ===');
for (const s of series) {
  if (cmp(s.hour, '2026-08-16-7') < 0) continue;
  const bn = (s.botnet_watch || []).map(b => `${(b.name||b.repo).split('/')[0]}/${(b.name||b.repo).split('/')[1]}(seen ${b.hours_seen}h)`).join('  ');
  console.log(`${s.hour}  ${bn || '-'}`);
}

console.log('\n=== DEMOTIONS — all-time top 10 ===');
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 10);
console.log(demos.map(x => `${x.hour} ${x.demoted_total}`).join(' | '));

// wave state via digest.json
try {
  const digest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', 'digest.json'), 'utf8'));
  console.log('\n=== DIGEST (latest) ===');
  console.log(JSON.stringify(digest, null, 1).slice(0, 900));
} catch (e) { console.log('digest read failed:', e.message); }
