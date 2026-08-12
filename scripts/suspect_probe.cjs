const fs = require('fs');
const d = JSON.parse(fs.readFileSync('site/data/snapshot.json', 'utf8'));
const targets = ['quoctuan21112009-maker/pull-request', 'docker-hardened-images/log'];
for (const r of d.top_hot) {
  if (targets.includes(r.repo)) {
    console.log(JSON.stringify(r, null, 1));
    console.log('====');
  }
}
// also scan all top_hot and demoted for 1-2 actor high-push repos
console.log('--- demoted sample ---');
for (const r of (d.demoted || []).slice(0, 5)) console.log(r.repo, '| pushes', r.pushes, '| actors', r.actors, '| flag', r.flag);
console.log('--- bot_watch ---');
for (const r of (d.bot_watch || []).slice(0, 8)) console.log(r.repo, '| pushes', r.pushes, '| actors', r.actors, '| flag', r.flag);
