// run29_analysis.cjs — POST-RE-BREACH: cycle compression test, minting, veterans, templates
// Questions from run 28's plan:
//  (a) h18 59.5% re-breach — collapse like h12 (25.7%) or does the 2-3h compressed cycle hold?
//      h0 shows 71.4% (ALL-TIME HIGH, prev 66.2%) — map the full trajectory h12 -> h0
//  (b) minting h16-h0: decelerate or re-accelerate to >=500?
//  (c) ugmoddev persistence: 95-157/hr h12-h18 — still pushing h19-h0? (18h+?)
//  (d) jvhoang / elad-cmd rotation or stabilization
//  (e) does the romerosabrina6 template-A batch (h17/h18 debut) carry into h19+ or rotate out?
//  (f) naming template cadence h18 -> h0 (A -> gibberish -> hyphen -> A?)
//  (g) new record: 71.4% at h0 — biggest surge ever, what fueled it (mint timing)?
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

console.log('\n=== (a) TRAJECTORY h12 -> h0 (compressed-cycle test) ===');
const tail = series.filter(s => cmp(s.hour, '2026-08-14-12') >= 0);
let prev = null;
for (const s of tail) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50% BREACH' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}  events=${s.events}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== ALL-TIME EXTREMES (97h) ===');
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

console.log('\n=== (c)+(d) VETERAN PERSISTENCE: hourly push rates h12 -> h0 ===');
const vets = ['ugmoddev', 'elad-cmd', 'jvhoang', 'LiamBruhin', 'wsch40', 'srjordan6'];
// build actor -> hour -> pushes from bot_watch per hour
const hourly = {};
for (const s of series) {
  if (cmp(s.hour, '2026-08-14-12') < 0) continue;
  hourly[s.hour] = {};
  for (const f of (s.bot_watch || [])) {
    for (const a of (f.actor_names || [])) hourly[s.hour][a] = (hourly[s.hour][a] || 0) + f.pushes;
  }
  // also top_actors? no — bot_watch is enough for farms
}
const hseq = Object.keys(hourly).sort(cmp);
for (const v of vets) {
  const rates = hseq.map(h => `${h.slice(11)}:${hourly[h][v] || 0}`).join('  ');
  console.log(`${v.padEnd(12)} ${rates}`);
}

console.log('\n=== (e)+(f) TOP-5 FARMS + NAMING TEMPLATE per hour h18 -> h0 ===');
const tA = /^[a-z]+[0-9]+$/;            // template A: name+digits (romerosabrina6)
const hyp = /^[a-z]+-[0-9]+$/;          // hyphen: winson-00178005
const gib = /^[a-z0-9]{5,}$/;           // gibberish-ish lowercase alnum (phb4000, spiith88tuwis)
const numeric = /^\d+$/;                // bare numeric
for (const s of series) {
  if (cmp(s.hour, '2026-08-14-18') < 0) continue;
  const farms = (s.bot_watch || []).slice().sort((a, b) => b.pushes - a.pushes).slice(0, 5);
  const names = farms.map(f => `${f.actor_names[0]}/${f.repo.split('/')[1]} (${f.pushes})`).join('  ');
  // template of top-10 farm actors this hour
  const top10 = (s.bot_watch || []).slice().sort((a, b) => b.pushes - a.pushes).slice(0, 10);
  const tmpl = { A: 0, hyphen: 0, gibberish: 0, numeric: 0, other: 0 };
  for (const f of top10) {
    const n = (f.actor_names[0] || '');
    if (tA.test(n)) tmpl.A++;
    else if (hyp.test(n)) tmpl.hyphen++;
    else if (numeric.test(n)) tmpl.numeric++;
    else if (gib.test(n)) tmpl.gibberish++;
    else tmpl.other++;
  }
  console.log(`${s.hour}  [${Object.entries(tmpl).map(([k, v]) => `${k}:${v}`).join(' ')}]  ${names}`);
}

console.log('\n=== (g) RECORD h0 DECOMPOSITION: top farms at 71.4% hour ===');
const h0 = series.find(s => s.hour === '2026-08-15-0');
const farms0 = (h0.bot_watch || []).slice().sort((a, b) => b.pushes - a.pushes).slice(0, 12);
for (const f of farms0) {
  const hrs = f.hours_seen || 0;
  const mark = hrs >= 8 ? '  <-- veteran' : (hrs >= 3 ? '  <-- mid' : '  <-- fresh');
  console.log(`${String(f.pushes).padStart(4)}/hr  ${f.actor_names[0].padEnd(18)} ${f.repo}  seen ${hrs}h (first ${f.first_seen})${mark}`);
}
console.log(`\nledger: ${h0.ledger_size} actors (${h0.ledger_confirmed} confirmed) | demoted h0: ${h0.demoted_total} | suspicious loops: ${h0.suspicious_total}`);

console.log('\n=== MINT-DEPLOY LEAD: minted>=500 hours vs subsequent >=50% breaches ===');
let breaches = [];
for (const s of series) if (s.push_spam_pct >= 50) breaches.push(s.hour);
const mints = Object.entries(batch).filter(([h, n]) => n >= 500).sort((a, b) => cmp(a[0], b[0]));
console.log('mint>=500 hours:', mints.map(([h, n]) => `${h} (${n})`).join(', '));
console.log('breach>=50% hours:', breaches.join(', '));

console.log('\n=== events/repos trend h18->h0 ===');
for (const s of tail.slice(6)) {
  console.log(`${s.hour}  events=${s.events}  repos=${s.repos_seen}  spam=${s.push_spam_pct}%`);
}
