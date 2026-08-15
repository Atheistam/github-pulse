#!/usr/bin/env node
// run33 analysis: hours 10-12 Aug 15 — surge decay? minting? squads? veterans? naming?
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d+\.json$/.test(f)).sort((a, b) => {
  const ha = parseInt(a.split('-')[3], 10), hb = parseInt(b.split('-')[3], 10);
  return a.slice(0, 10) === b.slice(0, 10) ? ha - hb : (a < b ? -1 : 1);
});
console.log('hours on disk:', files.length, '| first:', files[0], '| last:', files[files.length - 1]);

function loadHour(label) {
  const base = label.endsWith('.json') ? label.slice(0, -5) : label;
  try { return JSON.parse(fs.readFileSync(path.join(HIST, base + '.json'), 'utf8')); } catch (e) { return null; }
}

// spam % per hour — find the field
const last = loadHour(files[files.length - 1]);
console.log('last hour keys:', Object.keys(last).slice(0, 40).join(', '));
console.log('last hour:', last.hour, 'events:', last.events, 'repos:', last.repos_seen);

// try to find spam metric
const cand = last.spam || last.spam_pct || last.push_spam || last.stats;
if (cand) console.log('spam field sample:', JSON.stringify(cand).slice(0, 400));
