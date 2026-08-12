const fs = require('fs');
const d = JSON.parse(fs.readFileSync('site/data/snapshot.json', 'utf8'));
const targets = ['quoctuan21112009-maker/pull-request', 'docker-hardened-images/log'];
console.log('=== bot_watch ===');
for (const r of d.bot_watch) if (targets.includes(r.repo)) console.log('CAUGHT:', r.repo, r.flag, 'pushes', r.pushes);
console.log('=== demoted ===');
for (const r of d.demoted) if (targets.includes(r.repo)) console.log('DEMOTED:', r.repo, r.flag, 'pushes', r.pushes, 'human', r.human);
console.log('=== top_hot check ===');
for (const r of d.top_hot) if (targets.includes(r.repo)) console.log('STILL HOT:', r.repo, r.flag, 'heat', r.heat);
console.log('=== top_active check ===');
for (const r of d.top_active) if (targets.includes(r.repo)) console.log('STILL ACTIVE:', r.repo, r.flag);
console.log('=== search ALL lists for quoctuan-family repos ===');
const q = ['quoctuan', 'pull-request'];
for (const list of ['top_hot', 'top_active', 'top_human', 'bot_watch', 'demoted']) {
  for (const r of d[list] || []) {
    if (q.some(t => (r.repo || '').toLowerCase().includes(t))) console.log(list, ':', r.repo, r.flag || '');
  }
}
console.log('=== farm ledger: quoctuan entry now ===');
const fa = JSON.parse(fs.readFileSync('site/data/farm_actors.json', 'utf8'));
for (const k of Object.keys(fa)) if (k.includes('quoctuan')) console.log(k, JSON.stringify(fa[k]));
console.log('=== new farm actors added this run (maker/hyphen) ===');
let m = 0;
for (const k of Object.keys(fa)) if (/-maker$/.test(k) || /^[a-z]+[0-9]{2,}[a-z]*-[a-z0-9]+$/.test(k)) m++;
console.log('hyphen/maker pattern actors in ledger:', m);
