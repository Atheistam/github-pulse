const fs = require('fs');
const fa = JSON.parse(fs.readFileSync('site/data/farm_actors.json', 'utf8'));
// search for quoctuan or docker-hardened or pull-request actors
const terms = ['quoctuan', 'docker-hardened', 'pull-request'];
const keys = Object.keys(fa);
console.log('ledger size:', keys.length);
for (const t of terms) {
  const hits = keys.filter(k => k.includes(t) || (fa[k].owner || '').includes(t));
  console.log(t, '->', hits.length, 'entries');
  for (const h of hits.slice(0, 5)) console.log('  ', h, JSON.stringify(fa[h]).slice(0, 150));
}
// sample of what a fresh farm entry looks like
const sample = keys.slice(0, 2);
for (const s of sample) console.log('sample:', s, JSON.stringify(fa[s]).slice(0, 200));
