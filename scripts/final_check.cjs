#!/usr/bin/env node
const fa = require('../site/data/farm_actors.json');
const entries = Object.keys(fa);
const bots = entries.filter(a => /\[bot\]$/.test(a) || ['regro-cf-autotick-bot', 'regro-cf-autotick-bot-staging'].includes(a));
console.log('shared bots still in ledger:', bots.length, bots.join(', '));
// check that the farms we WANT are still present
const want = ['liambruhin', 'betorj04', 'jvhoang', 'ugmoddev', 'zerotraceh1', 'elad-cmd', 'wave-res', 'xolirx', 'loan96060-tech', 'ppfdalerts'];
console.log('\nwanted farms in ledger:');
want.forEach(w => console.log(' ', w.padEnd(18), fa[w] ? fa[w].hours.length + 'h' : 'MISSING'));
// snapshot bot_watch top farms
const s = require('../site/data/snapshot.json');
console.log('\nbot_watch (top 5):', s.bot_watch.slice(0, 5).map(b => b.repo + '(' + b.pushes + 'p)').join(', '));
console.log('spam%:', s.push_spam_pct, '| demoted:', s.demoted_total, '| suspicious:', s.suspicious_total);
