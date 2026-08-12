// trend check: spam% over hours + top_hot flags + issue-loop recurrence
const fs = require('fs');
const path = '/Users/bolero/rogue-dev/site/data/history';
const files = fs.readdirSync(path).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
console.log('hour         spam%   demoted susp  top1(heat,flag)');
const rows = [];
for (const f of files) {
  const hour = f.replace('.json', '');
  const d = JSON.parse(fs.readFileSync(path + '/' + f, 'utf8'));
  if (!d.top_hot) continue;
  const t1 = d.top_hot[0] || {};
  rows.push({
    hour, spam: d.push_spam_pct != null ? d.push_spam_pct : d.spam_pct,
    dem: d.demoted_total != null ? d.demoted_total : (d.demoted ? d.demoted.length : 0),
    susp: d.suspicious_total,
    top1: t1.repo, heat: t1.heat, flag: t1.flag || ''
  });
}
for (const r of rows.slice(-14)) {
  console.log(`${r.hour}  ${String(r.spam).padStart(5)}%  ${String(r.dem).padStart(6)} ${String(r.susp).padStart(5)}  ${r.top1}(${r.heat},${r.flag})`);
}
// any flags in latest top_hot?
const last = files.filter(f => f !== 'index.json').sort().pop();
const d = JSON.parse(fs.readFileSync(path + '/' + last, 'utf8'));
console.log('\nlatest hour', last.replace('.json', ''));
console.log('flagged in top_hot:', d.top_hot.filter(r => r.flag).map(r => r.repo + '[' + r.flag + ']').join(', ') || 'NONE');
console.log('top5:', d.top_hot.slice(0, 5).map(r => `${r.repo}(${r.heat},${r.flag||'-'})`).join(' | '));
// star-only repos in latest top list
console.log('star-only in top25:', d.top_hot.filter(r => (r.stars||0) >= 3 && !(r.prs||0) && !(r.issues||0) && !(r.pushes||0)).map(r => r.repo + '(' + r.stars + '★)').join(', ') || 'NONE');
