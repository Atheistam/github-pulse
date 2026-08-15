// run30_analysis.cjs — REGIME-FLIP FOLLOW-UP: record hold/collapse, factory idle, veterans, disguises
// Questions from run 29's plan:
//  (a) h0 71.4% ALL-TIME HIGH — does it hold, collapse (h12-style -21.5pt or worse), or plateau >=50%?
//  (b) minting: h0 18 = one-hour pause or has mint-and-burn been ABANDONED (veteran-only regime)?
//  (c) ugmoddev: pass 15h+ continuous? sustain 250+/hr or fatigue?
//  (d) srjordan6 (h0 debut 245/hr): new veteran or rotate out in 1-2h?
//  (e) disguises: nekovach-commits/StockPredictions + SoliSpirit/proxy-list spread?
//  (f) streak: new steady state >=50% or was 7h the max siege length?
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

console.log('\n=== (a)+(f) SPAM TRAJECTORY h16 -> h3 (regime-flip follow-up) ===');
const tail = series.filter(s => cmp(s.hour, '2026-08-14-16') >= 0);
let prev = null;
for (const s of tail) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50% BREACH' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== (a) STREAK: consecutive >=50% hours (longest runs in 100h) ===');
let run = 0, best = 0, bestEnd = '';
for (const s of series) {
  if (s.push_spam_pct >= 50) { run++; if (run > best) { best = run; bestEnd = s.hour; } }
  else run = 0;
}
console.log(`longest streak: ${best} consecutive hours ending ${bestEnd}`);
// current streak status
run = 0; let curEnd = '';
for (const s of series) {
  if (s.push_spam_pct >= 50) { run++; curEnd = s.hour; } else run = 0;
}
console.log(`current streak: ${run} consecutive hours ending ${curEnd}`);

console.log('\n=== ALL-TIME EXTREMES (100h) ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 5);
console.log('highest 5:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
let maxJump = 0, maxJumpH = '', maxDrop = 0, maxDropH = '';
for (let i = 1; i < series.length; i++) {
  const d = series[i].push_spam_pct - series[i - 1].push_spam_pct;
  if (d > maxJump) { maxJump = d; maxJumpH = series[i].hour; }
  if (d < maxDrop) { maxDrop = d; maxDropH = series[i].hour; }
}
console.log(`biggest 1h jump: +${maxJump.toFixed(1)}pt at ${maxJumpH} | biggest 1h drop: ${maxDrop.toFixed(1)}pt at ${maxDropH}`);

console.log('\n=== (c)+(d) VETERAN PERSISTENCE: hourly push rates h12 -> h3 ===');
const vets = ['ugmoddev', 'elad-cmd', 'jvhoang', 'LiamBruhin', 'wsch40', 'srjordan6', 'twoai-content'];
const hourly = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-14-12') < 0) continue;
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

console.log('\n=== (c) ugmoddev DETAIL: botnet_watch entry h3 ===');
const bn = (last.botnet_watch || []).filter(f => f.repo.includes('ugmoddev'));
for (const f of bn) console.log(JSON.stringify(f));

console.log('\n=== (e) DISGUISE WATCH: specific repos in bot_watch/demoted h1-h3 ===');
const disguises = ['StockPredictions', 'proxy-list', 'nekovach', 'SoliSpirit'];
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-0') >= 0)) {
  const hits = [];
  for (const f of (s.bot_watch || [])) {
    if (disguises.some(d => (f.repo + ' ' + (f.actor_names || []).join(' ')).includes(d))) hits.push(`bot:${f.repo}(${f.pushes}/hr)`);
  }
  for (const f of (s.demoted || [])) {
    if (disguises.some(d => f.repo.includes(d))) hits.push(`demoted:${f.repo}(${f.pushes})`);
  }
  console.log(`${s.hour}: ${hits.length ? hits.join('  ') : 'no disguise hits'}`);
}

console.log('\n=== (b) MINTING h1-h3: factory still idle? ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-14-20') >= 0)) {
  console.log(`${s.hour}  minted=${batch[s.hour] || 0}`);
}

console.log('\n=== TOP FARMS h1-h3 (fresh vs veteran mix) ===');
for (const s of series.filter(x => cmp(x.hour, '2026-08-15-1') >= 0)) {
  const farms = (s.bot_watch || []).slice().sort((a, b) => b.pushes - a.pushes).slice(0, 8);
  console.log(`\n${s.hour}:`);
  for (const f of farms) {
    const mark = f.hours_seen >= 8 ? 'VETERAN' : (f.hours_seen >= 3 ? 'mid' : 'FRESH');
    console.log(`  ${String(f.pushes).padStart(4)}/hr ${String(f.actor_names[0]).padEnd(18)} ${f.repo}  seen ${f.hours_seen}h ${mark}`);
  }
}

console.log('\n=== MINT-DEPLOY LEAD (rule demoted?): mint>=500 hours vs breaches h1-h3 ===');
const breaches = series.filter(s => s.push_spam_pct >= 50).map(s => s.hour);
const mints = Object.entries(batch).filter(([h, n]) => n >= 500).sort((a, b) => cmp(a[0], b[0]));
console.log('last 6 mint>=500:', mints.slice(-6).map(([h, n]) => `${h} (${n})`).join(', '));
console.log('breaches h16+: ', breaches.filter(h => cmp(h, '2026-08-14-16') >= 0).join(', '));
