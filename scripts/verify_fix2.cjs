const fs = require('fs');
const d = JSON.parse(fs.readFileSync('site/data/snapshot.json', 'utf8'));
console.log('bot_watch count:', d.bot_watch.length);
for (const r of d.bot_watch) console.log(' BW:', r.repo, '| pushes', r.pushes, '|', r.flag);
console.log('---');
console.log('demoted count:', d.demoted.length);
for (const r of d.demoted.slice(0, 20)) console.log(' DM:', r.repo, '| pushes', r.pushes, '|', r.flag, '| human', r.human);
console.log('---');
console.log('demoted_total:', d.demoted_total, '| suspicious_total:', d.suspicious_total);
console.log('---');
// search top_hot full
console.log('top_hot count:', d.top_hot.length);
for (const r of d.top_hot) console.log(' HOT:', r.repo, '| heat', r.heat, '|', r.flag);
