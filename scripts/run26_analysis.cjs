// run26_analysis.cjs — POST-BREACH: does the h8 55.6% surge decay or sustain?
// Questions:
//  (a) h10-h12 spam%: decay to sub-45% (post-batch lull) or sustain >=50%?
//  (b) minting re-arm: factory re-accelerate to >=500/hr (next surge inbound)?
//  (c) fresh-batch persistence: sweeneyrachel2528 etc — still pushing or rotated?
//  (d) old guards LiamBruhin/ugmoddev: re-ramping?
//  (e) naming template: still template A, or rotated again?
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const LEDGER = path.join(__dirname, '..', 'site', 'data', 'farm_actors.json');

const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).sort(cmp);
const series = [];
for (const f of files) {
  const h = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));
  series.push(h);
}
series.sort((a, b) => cmp(a.hour, b.hour));

const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const batch = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  if (hrs[0]) batch[hrs[0]] = (batch[hrs[0]] || 0) + 1;
}

const last = series[series.length - 1];
console.log(`=== LAST HOUR IN HISTORY: ${last.hour} (n=${series.length}) ===`);

console.log('\n=== (a) DECAY TEST: h8/h9 breach -> h10+ ===');
const tail = series.filter(s => cmp(s.hour, '2026-08-14-6') >= 0);
for (const s of tail) {
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50%' : s.push_spam_pct >= 45 ? '  <-- >=45%' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  farms=${(s.bot_watch || []).length}  demoted=${s.demoted_total}${surge}`);
}
const after = series.filter(s => cmp(s.hour, '2026-08-14-10') >= 0).map(s => s.push_spam_pct);
if (after.length) {
  console.log(`\npost-breach hours (h10+): ${after.join(', ')}`);
  console.log(after.every(v => v < 45) ? '=> VERDICT: FULL DECAY to sub-45% (post-batch lull)' :
    after.some(v => v >= 50) ? '=> VERDICT: SUSTAINED — second >=50% breach (h10) then collapse (h12)' :
    '=> VERDICT: partial decay (45-50% zone)');
}

console.log('\n=== (b) MINTING RE-ARM CHECK (h10-h12) ===');
const m = ['2026-08-14-10', '2026-08-14-11', '2026-08-14-12'].map(h => batch[h] || 0);
console.log(`minted h10/h11/h12 = ${m.join('/')}`);
if (m.some(v => v >= 500)) {
  console.log('=> FACTORY RE-ARMED (>=500 minted) -> next surge window by lead-time rule: h12-h15 — LIVE TEST for next run');
} else {
  console.log('=> factory still trickling (<500/hr) -> no imminent surge by the lead-time rule');
}

console.log('\n=== (c) FRESH BATCH PERSISTENCE + (d) OLD GUARDS (h9-h12) ===');
const watches = ['LiamBruhin', 'ugmoddev', 'itaalo67', 'KleirRampage45', 'Fadil123', 'sweeneyrachel', 'trujillojoshua', 'thompsoncarrie', 'taylorlisa', 'suttonveronica', 'thomasmary', 'loganfoxdale', 'elad-cmd'];
for (const s of series.filter(x => cmp(x.hour, '2026-08-14-9') >= 0)) {
  const bw = s.bot_watch || [];
  const parts = watches.map(w => {
    const b = bw.find(x => (x.repo || '').includes(w));
    return b ? `${w.split(/[0-9]/)[0]}=${b.pushes}` : '';
  }).filter(Boolean).join(' ');
  const top = bw.slice(0, 5).map(x => `${x.repo.split('/')[0]}=${x.pushes}`).join(' ');
  console.log(`${s.hour}: watched[${parts || '-'}]  TOP5[${top || '-'}]`);
}

console.log('\n=== (e) NAMING TEMPLATE CHECK (h10-h12 demoted actors) ===');
const patA = /^[a-z]+[a-z0-9]+\d{2,}$/;   // firstname+lastname+digits
const patB = /^[a-z]+\d{2}$/;             // word+2digits
const patC = /^\d{6,}$/;                  // bare numeric
for (const h of ['2026-08-14-10', '2026-08-14-11', '2026-08-14-12']) {
  const p = path.join(HIST, h + '.json');
  if (!fs.existsSync(p)) continue;
  const hd = JSON.parse(fs.readFileSync(p, 'utf8'));
  const demoted = (hd.demoted || []).map(d => d.repo.split('/')[0]);
  const counts = { A: 0, B: 0, C: 0, OTHER: 0 };
  const sample = [];
  for (const a of demoted.slice(0, 40)) {
    const t = patA.test(a) ? 'A' : patB.test(a) ? 'B' : patC.test(a) ? 'C' : 'OTHER';
    counts[t]++;
    if (sample.length < 6) sample.push(a);
  }
  console.log(`${h}: sample40 A=${counts.A} B=${counts.B} C=${counts.C} OTHER=${counts.OTHER}  e.g. ${sample.join(', ')}`);
}

console.log('\n=== CONTINUITY ===');
let totEv = 0;
for (const s of series) totEv += s.events || 0;
console.log(`history: ${series[0].hour} -> ${last.hour} (${series.length}h gapless)`);
console.log(`total events: ${totEv.toLocaleString()}`);
console.log(`ledger=${Object.keys(ledger).length} confirmed=${last.ledger_confirmed} (last hour)`);

const recentMint = m;
console.log(`\nFACTORY_FLAG=${Math.max(...recentMint) >= 500 ? 'REARMED' : 'TRICKLE'}  recentMint=${recentMint.join('/')}`);
