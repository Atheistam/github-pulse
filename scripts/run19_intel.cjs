// Run 19: farm intel — ugmoddev persistence, rnfvn/brnfvn family, synchronized batches
const fs = require('fs');
const HOME = process.env.HOME;
const dir = HOME + '/rogue-dev/site/data/history';
const hours = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
const pats = [/ugmoddev/i, /brnfvn/i, /liambruhin/i, /rnfvn/i];
console.log('=== family sightings (last 12h) ===');
for (const h of hours.slice(-12)) {
  const d = require(dir + '/' + h);
  const bws = d.bot_watch || [];
  const hits = bws.filter(b => pats.some(p => p.test(b.repo || '')));
  console.log(h, '->', hits.map(b => b.repo + '(' + b.pushes + ')').join(', ') || '-');
}

// Synchronized batch detection: actors with identical first_seen hour and similar push rate
const ledger = require(HOME + '/rogue-dev/site/data/farm_actors.json');
console.log('\n=== ledger total entries:', Object.keys(ledger).length, '===');
// find actors first seen in the newest hours (numeric hour sort!)
const byFirst = {};
for (const [id, e] of Object.entries(ledger)) {
  const first = [...e.hours].sort((a, b) => {
    const na = parseInt(a.split('-')[3], 10), nb = parseInt(b.split('-')[3], 10);
    return na - nb;
  })[0];
  if (!byFirst[first]) byFirst[first] = [];
  byFirst[first].push(id);
}
const hourKey = h => h.slice(0, 10) + '-' + String(parseInt(h.split('-')[3], 10)).padStart(2, '0');
const sortedFirst = Object.keys(byFirst).sort((a, b) => hourKey(a) < hourKey(b) ? -1 : 1);
for (const h of sortedFirst.slice(-10)) {
  console.log('first_seen', h, ':', byFirst[h].length, 'actors');
}
