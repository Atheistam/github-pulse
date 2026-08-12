// star-bomb probe v2: scan history snapshots for star-only heat patterns
const fs = require('fs');
const path = '/Users/bolero/rogue-dev/site/data/history';
const files = fs.readdirSync(path).filter(f => f.endsWith('.json')).sort();
console.log('history files:', files.length, files.slice(0, 3), '...', files.slice(-2));

const starOnly = {}; // repo -> {hours, maxStars, flags:Set}
for (const f of files) {
  const hour = f.replace('.json', '');
  let data;
  try { data = JSON.parse(fs.readFileSync(path + '/' + f, 'utf8')); } catch (e) { continue; }
  // figure out structure
  if (!data.top_hot && !data.hot && !data.repos) { console.log(hour, 'no top_hot/repos keys:', Object.keys(data).slice(0, 8)); continue; }
  const list = data.top_hot || data.hot || data.repos;
  for (const r of list) {
    const stars = r.stars || 0, prs = r.prs || 0, iss = r.issues || 0, pushes = r.pushes || 0;
    if (stars >= 3 && prs === 0 && iss === 0 && pushes === 0 && !r.releases) {
      if (!starOnly[r.repo]) starOnly[r.repo] = { hours: 0, maxStars: 0, flags: new Set(), lastHour: '' };
      starOnly[r.repo].hours++;
      starOnly[r.repo].maxStars = Math.max(starOnly[r.repo].maxStars, stars);
      if (r.flag) starOnly[r.repo].flags.add(r.flag);
      starOnly[r.repo].lastHour = hour;
    }
  }
}
const rows = Object.entries(starOnly).sort((a, b) => b[1].maxStars - a[1].maxStars);
console.log('\nstar-only repos seen in top lists:', rows.length);
for (const [repo, v] of rows.slice(0, 30)) {
  console.log(`${repo}  stars=${v.maxStars} hours=${v.hours} flags=[${[...v.flags].join(',')}] last=${v.lastHour}`);
}
