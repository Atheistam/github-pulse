#!/usr/bin/env node
const s = require('../site/data/snapshot.json');
const b = s.bot_watch[0];
console.log('bot_watch[0] keys:', Object.keys(b));
console.log(JSON.stringify(b, null, 1).slice(0, 600));
// check top_active first entry
const a = s.top_active[0];
console.log('top_active[0] keys:', Object.keys(a).join(','));
