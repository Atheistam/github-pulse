#!/usr/bin/env node
// Collateral check: which repos in current snapshot match candidate farm rules?
const s = require('../site/data/snapshot.json');
const human = (r) => (r.prs || 0) + (r.issues || 0) + (r.stars || 0) + (r.forks || 0) + (r.releases || 0) + (r.reviews || 0);
const autoName = (r) => {
  const [owner = '', repo = ''] = String(r.repo || '').toLowerCase().split('/');
  return /^[a-z]+[0-9]{2,}[a-z]*$/.test(owner) && /^[a-z]{3,10}$/.test(repo);
};
const seen = new Set();
const add = (list, label) => (list || []).forEach((r) => {
  if (seen.has(r.repo)) return;
  seen.add(r.repo);
  const h = human(r), pushes = r.pushes || 0, actors = r.actors || 0;
  const rules = [];
  if (pushes >= 10 && actors <= 2 && h === 0) rules.push('ZERO-HUMAN-10+');
  if (pushes >= 25 && actors <= 2 && h === 0) rules.push('OLD-25');
  if (autoName(r) && pushes >= 8 && actors <= 2 && h <= 2) rules.push('AUTONAME');
  if (rules.length) console.log(`${label.padEnd(8)} ${r.repo.padEnd(42)} p=${String(pushes).padStart(3)} a=${actors} h=${h} [${rules.join(' ')}]`);
});
add(s.top_hot, 'hot');
add(s.top_active, 'active');
add(s.top_human, 'human');
add(s.top_releases, 'rel');
add(s.bot_watch, 'bot');
console.log('---');
console.log('total flagged by ZERO-HUMAN-10+ rule:', [...seen].length);
