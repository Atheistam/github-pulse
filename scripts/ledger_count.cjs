const ledger = require('../site/data/farm_actors.json');
const entries = Object.values(ledger);
console.log('total entries:', entries.length);
const sample = entries[0];
console.log('sample entry:', JSON.stringify(sample).slice(0, 300));
// check for any truthy confirmed
let conf = 0;
for (const e of entries) if (e.confirmed) conf++;
console.log('entries with confirmed truthy:', conf);
// check field names
const keys = new Set();
for (const e of entries) Object.keys(e).forEach(k => keys.add(k));
console.log('all keys:', [...keys].join(', '));
// count entries with hours array
let withHours = 0;
for (const e of entries) if (Array.isArray(e.hours) && e.hours.length) withHours++;
console.log('entries with hours:', withHours);
