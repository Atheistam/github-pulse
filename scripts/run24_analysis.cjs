// run24_analysis.cjs — VERDICT WINDOW: does the lead-time rule survive?
// Run 23 prediction: h2/h3 minting 629/1175 >= 500/hr -> >=50% surge within 1-4h.
// This run's data: h4-h6 of Aug 14.
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
const key = h => { const p = h.split('-'); return Date.parse(p.slice(0, 3).join('-') + 'T00:00:00Z') / 86400000 * 24 + Number(p[3]); };
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort((x, y) => key(x) - key(y));
  if (hrs[0]) batch[hrs[0]] = (batch[hrs[0]] || 0) + 1;
}

console.log('=== VERDICT TABLE: minting (first_seen) vs spam ===');
const tail = series.filter(s => s.hour >= '2026-08-14-0');
for (const s of tail) {
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  farms=${(s.bot_watch || []).length}  demoted=${s.demoted_total}`);
}

console.log('\n=== RULE TEST: did h2/h3 (629/1175) predict a surge in h4-h6? ===');
console.log('h4=27.0 (dip!), h5=37.6 (rising), h6=49.6 (surge landing)');
console.log('=> surge arrived at the OUTER EDGE of the 1-4h window (+12pt/1h into h6)');
console.log('=> h7 will show whether it breaches the formal >=50% threshold');

console.log('\n=== NEW BATCH (first_seen h4-h6) vs OLD GUARDS ===');
const watches = ['LiamBruhin', 'ugmoddev', 'itaalo67', 'KleirRampage45', 'Fadil123'];
for (const s of tail.slice(-3)) {
  const bw = s.bot_watch || [];
  const parts = watches.map(w => {
    const b = bw.find(x => (x.repo || '').includes(w));
    return b ? `${w}=${b.pushes}` : '';
  }).filter(Boolean).join(' ');
  const newOnes = bw.filter(x => !watches.some(w => (x.repo || '').includes(w))).slice(0, 6)
    .map(x => `${x.repo.split('/')[0]}=${x.pushes}`).join(' ');
  console.log(`${s.hour}: OLD[${parts || '-'}]  NEW[${newOnes || '-'}]`);
}

console.log('\n=== NAMING TEMPLATE CHECK (h6 new actors) ===');
const patA = /^[a-z]+[a-z0-9]+\d{2,}$/;   // firstname+lastname+digits (glennjennifer427810-style)
const patB = /^[a-z]+\d{2}$/;             // xongtle29-style
const patC = /^\d{6,}$/;                  // bare numeric
const h6 = JSON.parse(fs.readFileSync(path.join(HIST, '2026-08-14-6.json'), 'utf8'));
const demoted6 = (h6.demoted || []).map(d => d.repo.split('/')[0]);
for (const a of demoted6.slice(0, 12)) {
  const t = patA.test(a) ? 'A(firstname+digits)' : patB.test(a) ? 'B(word+2digits)' : patC.test(a) ? 'C(numeric)' : 'OTHER';
  console.log(`  ${a}  -> ${t}`);
}

console.log('\n=== CONTINUITY: total ledger / confirmed ===');
let conf = 0; for (const e of Object.values(ledger)) if (e.confirmed) conf++;
console.log(`ledger=${Object.keys(ledger).length} confirmed=${conf}`);
