// star-bomb probe: look for repos with high star counts but zero pushes/prs/issues
const m = require('/Users/bolero/rogue-dev/site/data/repo_meta.json');
const hits = Object.keys(m).filter(k => k.includes('guillaumemeyer') || k.includes('watermarks'));
console.log('hits:', hits);
if (hits.length) console.log(JSON.stringify(m[hits[0]], null, 1).slice(0, 1200));

// scan all repos: star-heavy + no other signal
const rows = [];
for (const [repo, v] of Object.entries(m)) {
  const stars = v.stars || 0, forks = v.forks || 0, prs = v.prs || 0, iss = v.issues || 0, pushes = v.pushes || 0;
  if (stars >= 3 && prs === 0 && iss === 0 && pushes === 0) {
    rows.push({ repo, stars, forks, actors: v.actorCount || v.actors || '?', flag: v.flag || '' });
  }
}
rows.sort((a, b) => b.stars - a.stars);
console.log('\nstar-only repos (stars>=3, zero pushes/prs/issues):', rows.length);
console.log(JSON.stringify(rows.slice(0, 25), null, 1));
