const fs = require('fs');
const d = JSON.parse(fs.readFileSync('site/data/snapshot.json', 'utf8'));
for (const r of d.top_hot.slice(0, 8)) {
  const flags = {};
  for (const k of Object.keys(r)) if (/flag|bot|spam|demo/i.test(k)) flags[k] = r[k];
  console.log(r.repo, '| heat', r.heat, '| pushes', r.pushes, '| actors', r.actors, '| flags', JSON.stringify(flags));
}
console.log('---meta---');
const meta = JSON.parse(fs.readFileSync('site/data/repo_meta.json', 'utf8'));
const ks = Object.keys(meta);
console.log('meta repos:', ks.length);
for (const k of ks.slice(0, 3)) console.log('sample:', k, JSON.stringify(meta[k]).slice(0, 160));
// check the suspicious repo
for (const k of ks) if (k.includes('quoctuan')) console.log('SUSPECT META:', k, JSON.stringify(meta[k]).slice(0, 300));
