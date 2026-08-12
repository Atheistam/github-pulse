const fs = require('fs');
const d = JSON.parse(fs.readFileSync('site/data/snapshot.json', 'utf8'));
// The snapshot only keeps top-15 demoted; check the raw history file for hour 12
// but the snapshot IS hour 12. Instead: scan top_hot before/after — quoctuan heat.
// Direct evidence: re-run flagOf logic on the stored repo objects via demoted_total delta.
// Find quoctuan in ANY stored list:
const lists = ['top_hot', 'top_active', 'top_human', 'bot_watch', 'demoted'];
let found = false;
for (const l of lists) for (const r of d[l] || []) {
  if ((r.repo || '').includes('quoctuan')) { console.log(l, 'contains quoctuan:', r.repo, 'flag', r.flag, 'heat', r.heat); found = true; }
}
if (!found) console.log('quoctuan NOT in any ranked list — consistent with demotion (heat 68 → 3.4, below top-25 cutoff)');
console.log('demoted_total:', d.demoted_total, '(prev run: 1282) → +', d.demoted_total - 1282, 'new farm repos caught');
console.log('suspicious_total:', d.suspicious_total, '(prev run: 1002)');
// re-check ledger size delta
const fa = JSON.parse(fs.readFileSync('site/data/farm_actors.json', 'utf8'));
console.log('ledger size now:', Object.keys(fa).length);
