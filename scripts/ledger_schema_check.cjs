// ledger_schema_check.cjs — inspect farm_actors.json entry shape
const fs = require('fs');
const ledger = JSON.parse(fs.readFileSync(__dirname + '/../site/data/farm_actors.json', 'utf8'));
const entries = Object.entries(ledger);
console.log('total entries:', entries.length);
// print 3 sample entries
for (const [a, e] of entries.slice(0, 3)) console.log(JSON.stringify({ actor: a, entry: e }).slice(0, 300));
// field union
const keys = new Set();
for (const [, e] of entries) Object.keys(e).forEach(k => keys.add(k));
console.log('all keys present:', [...keys].join(', '));
// how many have >=2 hours (what gen_api counts as confirmed)
let c = 0;
for (const [, e] of entries) if ((e.hours || []).length >= 2) c++;
console.log('entries with >=2 hours (gen_api confirmed def):', c);
