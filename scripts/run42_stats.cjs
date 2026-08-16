const fs = require('fs');
const files = fs.readdirSync('site/data/history').filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).map(f => f.replace(/\.json$/, ''));
files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
let total = 0, ge50 = 0, events = 0;
const series = files.map(f => JSON.parse(fs.readFileSync('site/data/history/' + f + '.json', 'utf8')));
for (const s of series) {
  total++; events += s.events;
  if (s.push_spam_pct >= 50) ge50++;
}
console.log(`hours: ${total}, >=50%: ${ge50} (${(ge50 / total * 100).toFixed(0)}%), events: ${events.toLocaleString()}`);
// last 12 hours spam + minting
for (const s of series.slice(-12)) {
  const h = s.hour.slice(11);
  console.log(`${s.hour.slice(5)}  spam=${s.push_spam_pct}%  demoted=${s.demoted_total}`);
}
// wave classification from digest
const d = JSON.parse(fs.readFileSync('site/data/digest.json', 'utf8'));
console.log('wave:', d.wave && d.wave.state, d.wave && d.wave.delta_1h, d.wave && d.wave.verdict);
