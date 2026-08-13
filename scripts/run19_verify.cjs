// Run 19: verify ugmoddev/liambruhin hours counts for accurate HN claims
const fs = require('fs');
const HOME = process.env.HOME;
const ledger = require(HOME + '/rogue-dev/site/data/farm_actors.json');
const hours = fs.readdirSync(HOME + '/rogue-dev/site/data/history')
  .filter(f => f.endsWith('.json') && f !== 'index.json');
// map owner names -> ledger ids via bot_watch repo owners
const ownerIds = {};
for (const f of hours) {
  const d = require(HOME + '/rogue-dev/site/data/history/' + f);
  for (const b of (d.bot_watch || [])) {
    const owner = (b.repo || '').split('/')[0];
    if (!owner) continue;
    ownerIds[owner.toLowerCase()] = owner;
  }
}
// ledger keys are numeric ids; match by scanning for names is not possible —
// instead report hours arrays for the top entries and count how many history
// files contain each owner in bot_watch
for (const target of ['ugmoddev', 'liambruhin', 'zerotraceh1', 'twang35']) {
  let seenIn = 0;
  for (const f of hours) {
    const d = require(HOME + '/rogue-dev/site/data/history/' + f);
    if ((d.bot_watch || []).some(b => (b.repo || '').toLowerCase().startsWith(target + '/'))) seenIn++;
  }
  console.log(target, '-> in bot_watch for', seenIn, 'of', hours.length, 'history hours');
}
