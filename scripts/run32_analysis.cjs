// run32_analysis.cjs — THE RULE-REBIRTH TEST: h6 minted 1,497 (biggest since 2,002) DURING a lull.
// Questions from run 31's plan:
//  (a) LEAD-TIME RULE REBIRTH: h6 48.3% climbing + 1,497 minted -> do h7-h9 breach >=50%?
//      If yes: rule is back (mint-during-lull -> surge 1-3h later). If no: re-arm failed to land.
//  (b) ugmoddev: 20h+ continuous? rate hold 200+?
//  (c) h6 squad (jaievicenory10/mistiane808/tras82deep 101-114/hr) — rotate out by h8 as predicted?
//  (d) naming template h7-h9 (gibberish vs template A)
//  (e) wave radar state h4 -> h9
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

console.log('\n=== (a) SPAM TRAJECTORY h4 -> h9 (rule-rebirth test) ===');
let prev = null;
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-4') >= 0)) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50% BREACH' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (a) MINTING h2 -> h9 (the 1,497 batch and what followed) ===');
console.log(['2','3','4','5','6','7','8','9'].map(h => `h${h}:${batch['2026-08-15-' + h] || 0}`).join('  '));

console.log('\n=== (a) BREACH STREAK ANALYSIS (full 106h) ===');
let run = 0, curEnd = '';
for (const s of series) { if (s.push_spam_pct >= 50) { run++; curEnd = s.hour; } else run = 0; }
console.log(`current streak: ${run} consecutive hours ending ${curEnd}`);
const allBreaches = series.filter(s => s.push_spam_pct >= 50).map(s => s.hour);
console.log(`total >=50% hours: ${allBreaches.length}/106; last 6: ${allBreaches.slice(-6).join(', ')}`);

console.log('\n=== ALL-TIME EXTREMES (106h) ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 5);
console.log('highest 5:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

// hourly actor rates h4 -> h9
const hourly = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-15-4') < 0) continue;
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
}
const hseq = Object.keys(hourly).sort(cmp);

console.log('\n=== (b) VETERAN TRACE h4 -> h9 ===');
const vets = ['ugmoddev', 'elad-cmd', 'jvhoang', 'LiamBruhin', 'wsch40', 'zerotraceh1', 'jaievicenory10', 'mistiane808', 'tras82deep'];
for (const v of vets) {
  const rates = hseq.map(h => `${h.slice(11)}:${hourly[h][v] || 0}`).join('  ');
  console.log(`${v.padEnd(14)} ${rates}`);
}

console.log('\n=== (b) ugmoddev FULL TRACE h13 -> h9 ===');
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

console.log('\n=== (c) h6 SQUAD TRACE (jaievicenory10/mistiane808/tras82deep + h6 top fresh) ===');
const squad = ['jaievicenory10', 'mistiane808', 'tras82deep'];
const h6farms = (series.find(s => s.hour === '2026-08-15-6') || {}).bot_watch || [];
const h6top = h6farms.slice().sort((a, b) => b.pushes - a.pushes).slice(0, 8);
for (const f of h6top) {
  const nm = f.actor_names[0];
  if (!squad.includes(nm)) squad.push(nm);
}
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-6') >= 0)) {
  const parts = [];
  for (const a of squad) {
    const r = hourly[s.hour] && hourly[s.hour][a];
    if (r) parts.push(`${a}:${r}`);
  }
  console.log(`${s.hour}: ${parts.length ? parts.join('  ') : 'ALL GONE'}`);
}

console.log('\n=== (d) NAMING TEMPLATE h4 -> h9 (top 6 farms, fresh vs veteran) ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-4') >= 0)) {
  const farms = (s.bot_watch || []).slice().sort((a, b) => b.pushes - a.pushes).slice(0, 6);
  const names = farms.map(f => `${f.actor_names[0]}(${f.pushes})`).join('  ');
  console.log(`${s.hour}: ${names}`);
}

console.log('\n=== (e) WAVE RADAR h4 -> h9 ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-4') >= 0)) {
  console.log(`${s.hour}: wave=${s.wave || 'n/a'}  spam=${s.push_spam_pct}%`);
}

console.log('\n=== TOP FARMS h7-h9 (who carried the surge) ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-7') >= 0)) {
  const farms = (s.bot_watch || []).slice().sort((a, b) => b.pushes - a.pushes).slice(0, 12);
  console.log(`\n${s.hour}:`);
  for (const f of farms) {
    const mark = f.hours_seen >= 8 ? 'VETERAN' : (f.hours_seen >= 3 ? 'mid' : 'FRESH');
    console.log(`  ${String(f.pushes).padStart(4)}/hr ${String(f.actor_names[0]).padEnd(18)} ${f.repo}  seen ${f.hours_seen}h ${mark}`);
  }
}

console.log('\n=== LEDGER: hours_seen TOP 12 actors (all-time persistence) ===');
const seen = Object.entries(ledger).map(([name, e]) => ({ name, n: (e.hours || []).length, first: (e.hours || [])[0], last: (e.hours || []).slice(-1)[0] }));
seen.sort((a, b) => b.n - a.n);
for (const s of seen.slice(0, 12)) console.log(`${String(s.n).padStart(3)}h ${s.name.padEnd(22)} ${s.first} -> ${s.last}`);

console.log('\n=== LEDGER TOTALS ===');
const confirmed = Object.values(ledger).filter(e => (e.confirmed || e.hours?.length) && e.seen >= 2).length;
console.log(`ledger actors: ${Object.keys(ledger).length} (confirmed-ish: ${confirmed})`);
