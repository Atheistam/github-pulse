// Run 19: ugmoddev persistence check + top persistent actors in ledger
const fs = require('fs');
const HOME = process.env.HOME;
const ledger = require(HOME + '/rogue-dev/site/data/farm_actors.json');
const hours = fs.readdirSync(HOME + '/rogue-dev/site/data/history')
  .filter(f => f.endsWith('.json') && f !== 'index.json');
const names = {}; // actor id -> names seen via bot_watch repos
for (const f of hours) {
  const d = require(HOME + '/rogue-dev/site/data/history/' + f);
  for (const b of (d.bot_watch || [])) {
    // repo "owner/name" — owner is the actor we care about
    const owner = (b.repo || '').split('/')[0];
    if (!owner) continue;
    names[owner.toLowerCase()] = owner;
  }
}
// rank ledger entries by hours seen
const ranked = Object.entries(ledger)
  .map(([id, e]) => ({ id, hours: e.hours.length, lastSeen: e.lastSeen }))
  .sort((a, b) => b.hours - a.hours)
  .slice(0, 15);
console.log('=== top persistent ledger entries (by hours seen) ===');
for (const r of ranked) console.log(r.id.padStart(9), 'hours:', String(r.hours).padStart(3), 'last:', r.lastSeen);
console.log('\n=== ugmoddev / LiamBruhin / brnfvn owners seen in bot_watch ===');
const fam = Object.keys(names).filter(n => /ugmoddev|liambruhin|brnfvn|rnfvn|trnfvn/.test(n));
console.log(fam.slice(0, 30).join(', '));
