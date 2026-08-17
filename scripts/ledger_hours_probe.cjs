// ledger_hours_probe.cjs — inspect hour arrays for veterans
const fs = require('fs');
const path = require('path');
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', 'farm_actors.json'), 'utf8'));
for (const a of ['loganfoxdale', 'zerotraceh1', 'ugmoddev', 'elad-cmd', 'Fadil123-hah', 'bogdanstancu1119-maker']) {
  const e = d[a];
  if (!e) { console.log(a, 'NOT IN LEDGER'); continue; }
  const hrs = (e.hours || []).sort();
  console.log('\n' + a, 'n=' + hrs.length, 'lastSeen=' + e.lastSeen);
  console.log('  first 12:', hrs.slice(0, 12).join(' '));
  console.log('  last 12:', hrs.slice(-12).join(' '));
  // check density: are the last 24 consecutive?
  const last24 = hrs.slice(-24).map(h => h.slice(11));
  console.log('  last 24 hour-labels:', last24.join(' '));
}
