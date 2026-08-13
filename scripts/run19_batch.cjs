// Run 19: full first_seen distribution to calibrate batch threshold
const HOME = process.env.HOME;
const ledger = require(HOME + '/rogue-dev/site/data/farm_actors.json');
const byFirst = {};
for (const [id, e] of Object.entries(ledger)) {
  const first = [...e.hours].sort((a, b) => {
    const na = parseInt(a.split('-')[3], 10), nb = parseInt(b.split('-')[3], 10);
    return na - nb;
  })[0];
  if (!byFirst[first]) byFirst[first] = 0;
  byFirst[first]++;
}
const keys = Object.keys(byFirst).sort((a, b) => {
  const ka = a.slice(0, 10) + '-' + String(parseInt(a.split('-')[3], 10)).padStart(2, '0');
  const kb = b.slice(0, 10) + '-' + String(parseInt(b.split('-')[3], 10)).padStart(2, '0');
  return ka < kb ? -1 : 1;
});
console.log('hour        new_actors');
for (const k of keys) console.log(k, String(byFirst[k]).padStart(6));
const vals = keys.map(k => byFirst[k]);
vals.sort((a, b) => a - b);
const med = vals[Math.floor(vals.length / 2)];
console.log('median:', med, '| max:', vals[vals.length - 1], '| hours:', vals.length);
