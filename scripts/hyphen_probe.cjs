const fs = require('fs');
const path = require('path');
const HIST = 'site/data/history';
const idx = JSON.parse(fs.readFileSync(path.join(HIST, 'index.json'), 'utf8'));
const files = (Array.isArray(idx) ? idx : idx.files || []).filter(f => f.endsWith('.json'));
// scan last 6 hours for repos whose owner matches word+digits-hyphen patterns
const re = /^[a-z]+[0-9]{2,}[a-z]*-[a-z0-9]+$/;
const seen = new Map();
let demotedWithHuman = 0, demotedTotal = 0;
for (const f of files.slice(-6)) {
  let snap;
  try { snap = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')); } catch { continue; }
  for (const b of [...(snap.bot_watch || []), ...(snap.demoted || [])]) {
    demotedTotal++;
    const owner = String(b.repo || '').split('/')[0].toLowerCase();
    if (re.test(owner)) {
      const human = (b.prs || 0) + (b.issues || 0) + (b.stars || 0) + (b.forks || 0) + (b.releases || 0) + (b.reviews || 0);
      if (human > 0) demotedWithHuman++;
      if (!seen.has(owner)) seen.set(owner, []);
      const arr = seen.get(owner);
      if (arr.length < 3 && !arr.includes(b.repo)) arr.push(b.repo);
    }
  }
}
console.log('demoted entries w/ hyphen-auto owner:', [...seen.keys()].length, 'of', demotedTotal, '| with human>0:', demotedWithHuman);
for (const [owner, repos] of [...seen.entries()].slice(0, 20)) console.log(' ', owner, '->', repos.join(', '));
// count repos with PRs from same actor: look at top_hot flagged repos' actor_names vs pr counts
