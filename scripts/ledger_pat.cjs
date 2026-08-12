const fs = require('fs');
const fa = JSON.parse(fs.readFileSync('site/data/farm_actors.json', 'utf8'));
const keys = Object.keys(fa);
// classify owner names by pattern
const pats = {
  'word+digits': /^[a-z]+[0-9]{2,}[a-z]*$/,
  'word+digits-maker': /^[a-z]+[0-9]{2,}[a-z]*-maker$/,
  'word+digits-hyphen': /^[a-z]+[0-9]{2,}[a-z]*-[a-z]+$/,
  'word+digits+word': /^[a-z]+[0-9]{2,}[a-z]+$/,
  'pure-digits': /^[0-9]+$/,
  'digits-word': /^[0-9]+[a-z]+/,
  'word-word-digits': /^[a-z]+-[a-z]+[0-9]{2,}/,
  'word-digits-word-digits': /^[a-z]+[0-9]+[a-z]+[0-9]+/,
};
const counts = {};
const samples = {};
for (const k of keys) {
  let matched = 'other';
  for (const [name, re] of Object.entries(pats)) {
    if (re.test(k)) { matched = name; break; }
  }
  counts[matched] = (counts[matched] || 0) + 1;
  if (!samples[matched]) samples[matched] = [];
  if (samples[matched].length < 8) samples[matched].push(k);
}
for (const [p, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(p, ':', c);
  console.log('   ', samples[p].join(', '));
}
// how many have only 1 hour (not yet "confirmed")?
let oneHour = 0, multiHour = 0;
for (const k of keys) { if (fa[k].hours.length >= 2) multiHour++; else oneHour++; }
console.log('---');
console.log('1-hour entries (below FARM_ACTOR_MIN_HOURS=2):', oneHour, '| multi-hour:', multiHour);
// quoctuan-like exact
const q = keys.filter(k => k.includes('21112009') || k.includes('-maker'));
console.log('maker-suffix owners:', q.length, q.slice(0, 12).join(', '));
