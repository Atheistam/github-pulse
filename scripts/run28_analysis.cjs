// run28_analysis.cjs — POST-SURGE: does the 62.4% peak decay? does the factory re-arm?
// Questions:
//  (a) spam trajectory h16-h18: post-peak decay (lull like h13) or sustained surge?
//  (b) minting h16-h18: re-accelerate to >=500 (4th consecutive cycle) or decelerate?
//  (c) jvhoang/elad-cmd/ugmoddev persistence — new veteran class forming?
//  (d) naming template cadence h16-h18
//  (e) does the h13-h14 surge batch (walexrush36 etc.) carry into h16+ or rotate out?
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
console.log(`=== LAST HOUR IN HISTORY: ${last.hour} (n=${series.length}) ===`);

console.log('\n=== (a) TRAJECTORY h12->h18 (surge peak -> decay?) ===');
const tail = series.filter(s => cmp(s.hour, '2026-08-14-12') >= 0);
let prev = null;
for (const s of tail) {
  const d = prev !== null ? `  (${s.push_spam_pct - prev >= 0 ? '+' : ''}${(s.push_spam_pct - prev).toFixed(1)}pt)` : '';
  const surge = s.push_spam_pct >= 50 ? '  <-- >=50% BREACH' : '';
  console.log(`${s.hour}  spam=${String(s.push_spam_pct).padStart(5)}%  minted=${String(batch[s.hour] || 0).padStart(5)}  demoted=${s.demoted_total}${d}${surge}`);
  prev = s.push_spam_pct;
}

console.log('\n=== ALL-TIME EXTREMES ===');
const lows = series.slice().sort((a, b) => a.push_spam_pct - b.push_spam_pct).slice(0, 3);
console.log('lowest 3:', lows.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));
const highs = series.slice().sort((a, b) => b.push_spam_pct - a.push_spam_pct).slice(0, 3);
console.log('highest 3:', highs.map(x => `${x.hour} ${x.push_spam_pct}%`).join(' | '));

let maxJump = 0, maxJumpH = '', maxDrop = 0, maxDropH = '';
for (let i = 1; i < series.length; i++) {
  const d = series[i].push_spam_pct - series[i - 1].push_spam_pct;
  if (d > maxJump) { maxJump = d; maxJumpH = series[i].hour; }
  if (d < maxDrop) { maxDrop = d; maxDropH = series[i].hour; }
}
console.log(`biggest 1h JUMP: +${maxJump.toFixed(1)}pt at ${maxJumpH}`);
console.log(`biggest 1h DROP: ${maxDrop.toFixed(1)}pt at ${maxDropH}`);

console.log('\n=== (b) MINTING h12->h18 (post-2,002-record re-arm pace) ===');
const m = [];
for (let h = 12; h <= 18; h++) m.push(batch[`2026-08-14-${h}`] || 0);
console.log(`minted h12..h18 = ${m.join('/')}`);
const recent = m.slice(-3);
if (recent.some(v => v >= 500)) {
  console.log('=> FACTORY RE-ARMED >=500 in last 3h -> another surge wave predicted per rule');
} else {
  console.log('=> factory decelerating (deploy-then-re-arm pattern), no imminent surge per rule');
}

console.log('\n=== (c) WATCHED ACTORS + TOP5 FARMS (h12-h18) ===');
const watches = ['LiamBruhin', 'ugmoddev', 'jvhoang', 'elad-cmd', 'loganfoxdale', 'williamsjacob', 'sweeneyrachel', 'trujillojoshua', 'thompsoncarrie', 'taylorlisa', 'matkcrais', 'walexrush', 'mackla', 'esparzajohn', 'walkereri', 'wsch', 'paulssand', 'evansnichole', 'mcleanpatricia', 'romerosabrina'];
for (const s of series.filter(x => cmp(x.hour, '2026-08-14-12') >= 0)) {
  const bw = s.bot_watch || [];
  const parts = watches.map(w => {
    const b = bw.find(x => (x.repo || '').includes(w));
    return b ? `${w}=${b.pushes}` : '';
  }).filter(Boolean).join(' ');
  const top = bw.slice(0, 5).map(x => `${x.repo.split('/')[0]}=${x.pushes}`).join(' ');
  console.log(`${s.hour}: watched[${parts || '-'}]  TOP5[${top || '-'}]`);
}

console.log('\n=== (e) SURGE BATCH PERSISTENCE (h13-h14 actors seen in h16-h18?) ===');
const surgeBatch = ['walexrush36', 'mackla1962', 'esparzajohn7517', 'walkereri', 'wsch40', 'paulssand27', 'evansnichole', 'mcleanpatricia'];
for (const s of series.filter(x => cmp(x.hour, '2026-08-14-16') >= 0)) {
  const bw = s.bot_watch || [];
  const parts = surgeBatch.map(w => {
    const b = bw.find(x => (x.repo || '').includes(w));
    return b ? `${w}=${b.pushes}` : '';
  }).filter(Boolean).join(' ');
  console.log(`${s.hour}: surge-batch still pushing: [${parts || 'NONE (rotated out)'}]`);
}

console.log('\n=== (d) NAMING TEMPLATE (h16-h18 demoted actors, first 40 each) ===');
const patA = /^[a-z]+[a-z0-9]+\d{2,}$/;   // firstname+lastname+digits
const patG = /^[a-z]{4,12}$/;             // lowercase gibberish word
const patH = /^[a-z]+-\d{5,}$/;           // hyphen+digits
const patN = /^\d{5,}$/;                  // bare numeric
for (const h of ['2026-08-14-16', '2026-08-14-17', '2026-08-14-18']) {
  const hd = JSON.parse(fs.readFileSync(path.join(HIST, h + '.json'), 'utf8'));
  const demoted = (hd.demoted || []).map(d => d.repo.split('/')[0]);
  const counts = { A: 0, G: 0, H: 0, N: 0, OTHER: 0 };
  const sample = [];
  for (const a of demoted.slice(0, 40)) {
    const t = patA.test(a) ? 'A' : patG.test(a) ? 'G' : patH.test(a) ? 'H' : patN.test(a) ? 'N' : 'OTHER';
    counts[t]++;
    if (sample.length < 8) sample.push(`${a}(${t})`);
  }
  console.log(`${h}: ${JSON.stringify(counts)}  sample: ${sample.join(' ')}`);
}

console.log('\n=== VERDICT ===');
const h16 = series.find(s => s.hour === '2026-08-14-16');
const h17 = series.find(s => s.hour === '2026-08-14-17');
const h18 = series.find(s => s.hour === '2026-08-14-18');
const sustained = [h16, h17, h18].filter(Boolean).filter(s => s.push_spam_pct >= 50).length;
console.log(`h16/h17/h18 >=50% breach count: ${sustained}/3`);
console.log(sustained >= 2
  ? 'SURGE SUSTAINED — first multi-hour >=50% stretch since Aug 12; decay hypothesis falsified'
  : sustained === 1
  ? 'SINGLE-HOUR BREACH then decay — surge pattern holding (peak then lull)'
  : 'SURGE COLLAPSED — decayed faster than expected');
console.log(`ledger now: ${last.ledger_size} actors (${last.ledger_confirmed} confirmed)`);
console.log(`series length: ${series.length} hours; last hour events: ${last.events}`);
