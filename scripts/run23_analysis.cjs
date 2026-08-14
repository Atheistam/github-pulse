// run23_analysis.cjs — operating-rule test: does minting predict pulse resume?
// Run 22 rule: if >=400-500 new ledger actors/hr → surge inbound within 1-4h.
//             if ~100/hr stays → trickle mode confirmed as new regime.
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');

const files = fs.readdirSync(HIST).filter(f => f.endsWith('.json')).sort();
const series = [];
for (const f of files) {
  const h = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));
  series.push(h);
}
series.sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));

// ---------- 1) spam + minting series, last 14 hours ----------
console.log('=== SPAM + MINTING SERIES (h14 Aug13 -> h3 Aug14) ===');
const tail = series.filter(s => s.hour >= '2026-08-13-14');
for (const s of tail) {
  const na = s.new_actors !== undefined ? s.new_actors : (s.ledger_new !== undefined ? s.ledger_new : 'n/a');
  const farms = (s.bot_watch || []).length;
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  events=${String(s.events).padStart(7)}  minted=${String(na).padStart(6)}  farms=${farms}  demoted=${s.demoted_total}`);
}

// ---------- 2) operating rule test ----------
console.log('\n=== OPERATING RULE TEST (minting -> surge prediction) ===');
const minting = tail.map(s => ({ hour: s.hour, minted: s.new_actors !== undefined ? s.new_actors : -1, spam: s.push_spam_pct }));
for (let i = 1; i < minting.length; i++) {
  const m = minting[i].minted;
  if (m < 0) continue;
  const label = m >= 400 ? 'FACTORY' : (m >= 200 ? 'moderate' : 'trickle');
  console.log(`${minting[i].hour}: minted=${m} (${label})  -> next spam ${i+1 < minting.length ? minting[i+1].spam + '%' : '?'}`);
}

// ---------- 3) key farm actor persistence ----------
console.log('\n=== FARM ACTOR PERSISTENCE (h18 Aug13 -> h3 Aug14) ===');
const watches = ['LiamBruhin', 'ugmoddev', 'itaalo67', 'KleirRampage45', 'Fadil123', 'zerotraceh1', 'SillyStuff', 'rnfvn', 'brnfvn', 'trnfvn', 'elad-cmd', 'cstolzl'];
for (const s of tail.filter(x => x.hour >= '2026-08-13-18')) {
  const bw = s.bot_watch || [];
  const parts = watches.map(w => {
    const b = bw.find(x => (x.repo || x.name || '').includes(w));
    return b ? `${w.split(/[0-9]/)[0]}=${b.pushes}` : (bw.some(x => (x.repo || '').includes(w)) ? `${w}=?` : '');
  }).filter(Boolean).join(' ');
  console.log(`${s.hour}: ${parts || '(none matched)'}`);
}

// ---------- 4) new names debuting h1-h3 ----------
console.log('\n=== NEW LEDGER ACTORS (first-seen h1-h3) — top by hour ===');
const LEDGER = path.join(__dirname, '..', 'site', 'data', 'farm_actors.json');
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const byFirst = {};
for (const [actor, e] of Object.entries(ledger)) {
  const hrs = (e.hours || []).sort();
  if (!hrs.length) continue;
  const first = hrs[0];
  if (first >= '2026-08-14-1' && first <= '2026-08-14-3') {
    if (!byFirst[first]) byFirst[first] = [];
    byFirst[first].push({ actor, hours: hrs.length, last: e.lastSeen });
  }
}
for (const hr of ['2026-08-14-1', '2026-08-14-2', '2026-08-14-3']) {
  const list = (byFirst[hr] || []).sort((a, b) => b.hours - a.hours);
  console.log(`${hr}: ${list.length} new actors; most-visible: ${list.slice(0, 8).map(x => `${x.actor}(${x.hours}h)`).join(', ') || '-'}`);
}

// ---------- 5) surge check since h15 ----------
console.log('\n=== SURGES (>=50%) since h15 Aug13 ===');
for (const s of tail) {
  if (s.push_spam_pct >= 50) console.log(`  ${s.hour}: ${s.push_spam_pct}%  <-- SURGE`);
}
const since = tail.filter(s => s.hour >= '2026-08-14-0').map(s => s.push_spam_pct);
console.log(`  hours since last surge: ${tail.length - tail.findIndex(s => s.push_spam_pct >= 50) - 1} (through h3)`);

// ---------- 6) wave classifications h18 -> h3 ----------
console.log('\n=== WAVE PHASES h18 -> h3 ===');
for (const s of tail.filter(x => x.hour >= '2026-08-13-18')) {
  console.log(`${s.hour}: ${s.wave ? s.wave.phase : 'n/a'}`);
}
