#!/usr/bin/env node
const fa = require('../site/data/farm_actors.json');
const AUTONAME_OWNER = /^[a-z]+[0-9]{2,}[a-z]*$/;
const entries = Object.keys(fa);
const autoGen = entries.filter(a => AUTONAME_OWNER.test(a));
const realish = entries.filter(a => !AUTONAME_OWNER.test(a));
console.log('ledger:', entries.length, '| auto-gen:', autoGen.length, '| real-looking:', realish.length);
// known big orgs / brands that must NEVER be in the ledger
const ORGS = ['posthog', 'microsoft', 'getsentry', 'n8n-io', 'openclaw', 'tenstorrent', 'elastic', 'pytorch', 'vercel', 'google', 'aws', 'facebook', 'meta', 'apple', 'amazon', 'github', 'docker', 'kubernetes', 'grafana', 'hashicorp', 'mongodb', 'stripe', 'shopify', 'netflix', 'spotify', 'cloudflare', 'jetbrains', 'gitlab', 'atlassian', 'datadog', 'twilio', 'slack', 'discord', 'notion', 'figma', 'canva', 'dropbox', 'sentry', 'netlify', 'supabase', 'firebase', 'openai', 'anthropic', 'deepmind', 'huggingface', 'linux', 'rust-lang', 'nodejs', 'python', 'golang', 'mozilla', 'torvalds', 'npm', 'yarn', 'pnpm', 'denoland', 'bun', 'vitejs', 'sveltejs', 'vuejs', 'angular', 'reactjs', 'facebookincubator'];
const poisoned = realish.filter(a => ORGS.includes(a));
console.log('KNOWN ORGS in ledger:', poisoned.length, poisoned.join(', '));
// top real-looking by hours
console.log('top 15 real-looking by hours:');
realish.sort((a, b) => (fa[b].hours.length || 0) - (fa[a].hours.length || 0)).slice(0, 15)
  .forEach(a => console.log(' ', a.padEnd(28), 'hours:', fa[a].hours.length, 'last:', fa[a].lastSeen));
