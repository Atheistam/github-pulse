// run22_analysis.cjs — cadence death test: h19-h23+0 spam, farm fatigue, minting
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
const tail = series.filter(s => s.hour >= '2026-08-13-14' && s.hour <= '2026-08-14-0');
console.log('=== RUN 22: cadence-death window (h14 -> h0) ===');
for (const s of tail) {
  const farms = (s.bot_watch || []).length;
  console.log(`${s.hour}  spam=${s.push_spam_pct}%  events=${s.events}  farms=${farms}  demoted=${s.demoted_total}`);
}

console.log('\n=== BOT WATCH top farms per hour (h18 -> h0) ===');
for (const s of tail.filter(x => x.hour >= '2026-08-13-18')) {
  const bw = (s.bot_watch || []).slice(0, 4).map(b => `${b.repo || b.name}(${b.pushes}pushes)`).join(', ');
  console.log(`${s.hour}: ${bw}`);
}

console.log('\n=== LiamBruhin / itaalo67 / ugmoddev persistence ===');
for (const s of tail) {
  const bw = s.bot_watch || [];
  const lb = bw.find(b => (b.repo || '').includes('LiamBruhin'));
  const it = bw.find(b => (b.repo || '').includes('itaalo67'));
  const ug = bw.find(b => (b.repo || '').includes('ugmoddev'));
  const f = (b) => b ? `${b.repo}(${b.pushes})` : '-';
  console.log(`${s.hour}  LiamBruhin:${f(lb)}  itaalo67:${f(it)}  ugmoddev:${f(ug)}`);
}

console.log('\n=== MINTING (new_actors if present) ===');
for (const s of tail) {
  console.log(`${s.hour}  new_actors=${s.new_actors !== undefined ? s.new_actors : 'n/a'}`);
}

console.log('\n=== wave classification h18 -> h0 ===');
for (const s of tail.filter(x => x.hour >= '2026-08-13-18')) {
  console.log(`${s.hour}  wave=${s.wave ? s.wave.phase + ' (' + s.wave.delta + 'pt)' : 'n/a'}`);
}
