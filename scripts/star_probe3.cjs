// deep dive: who starred spinabot/brigade and guillaumemeyer/watermarks-remover
const fs = require('fs');
const path = '/Users/bolero/rogue-dev/site/data/history';
const files = fs.readdirSync(path).filter(f => f.endsWith('.json') && f !== 'index.json').sort();

const targets = ['spinabot/brigade', 'guillaumemeyer/watermarks-remover', 'crawfordxx/xiaoma-durex-copywriter', 'cathrynlavery/diagram-design'];
const seen = {}; // repo -> {hours: [], actors:Set, stars, prs, issues, pushes, flag, events}
for (const f of files) {
  const hour = f.replace('.json', '');
  const data = JSON.parse(fs.readFileSync(path + '/' + f, 'utf8'));
  const list = data.top_hot || data.hot || data.repos || [];
  for (const r of list) {
    if (!targets.includes(r.repo)) continue;
    if (!seen[r.repo]) seen[r.repo] = { hours: [], actors: new Set(), stars: 0, prs: 0, issues: 0, pushes: 0, flag: '', events: 0 };
    seen[r.repo].hours.push(hour + ':' + (r.heat || 0) + (r.flag ? '[' + r.flag + ']' : ''));
    seen[r.repo].stars = Math.max(seen[r.repo].stars, r.stars || 0);
    seen[r.repo].prs += r.prs || 0;
    seen[r.repo].issues += r.issues || 0;
    seen[r.repo].pushes += r.pushes || 0;
    seen[r.repo].flag = r.flag || seen[r.repo].flag;
    seen[r.repo].events += r.events || 0;
    if (Array.isArray(r.actors)) r.actors.forEach(a => seen[r.repo].actors.add(typeof a === 'string' ? a : (a.login || a.name || JSON.stringify(a))));
    else if (Array.isArray(r.topActors)) r.topActors.forEach(a => seen[r.repo].actors.add(typeof a === 'string' ? a : (a.login || a.name || JSON.stringify(a))));
  }
}
for (const [repo, v] of Object.entries(seen)) {
  console.log('\n=== ' + repo + ' ===');
  console.log('hours:', v.hours.join(' | '));
  console.log('maxStars:', v.stars, 'prs:', v.prs, 'issues:', v.issues, 'pushes:', v.pushes, 'events:', v.events, 'flag:', v.flag);
  console.log('actors:', [...v.actors].join(', '));
}
