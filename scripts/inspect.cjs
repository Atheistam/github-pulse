#!/usr/bin/env node
const s = require('../site/data/snapshot.json');
console.log('top_hot:', s.top_hot.slice(0, 8).map(r => r.repo + '(' + r.heat + ',flag=' + (r.flag || '-') + ')').join(' | '));
const ph = (s.top_active || []).find(r => r.repo === 'PostHog/posthog');
console.log('PostHog in top_active:', JSON.stringify(ph));
console.log('bot_watch:', s.bot_watch.map(b => b.repo).join(', '));
console.log('demoted_total:', s.demoted_total, 'suspicious_total:', s.suspicious_total);
const fa = require('../site/data/farm_actors.json');
console.log('ledger entries:', Object.keys(fa).length);
console.log('posthog in ledger?', !!fa['posthog']);
