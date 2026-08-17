// run44_analysis.cjs — the big questions for report v5.30
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).sort(cmp);
const series = [];
for (const f of files) series.push(JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')));
series.sort((a, b) => cmp(a.hour, b.hour));

console.log('=== HOURS:', series.length, 'first:', series[0].hour, 'last:', series[series.length - 1].hour, '===');

// (a) streak analysis
let cur = 0, best = 0, runStart = '', prev = null;
const runs = [];
for (const s of series) {
  const ok = s.push_spam_pct >= 50;
  if (ok) { if (cur === 0) runStart = s.hour; cur++; }
  else { if (cur > 0) runs.push([runStart, prev.hour, cur]); cur = 0; }
  if (ok && cur > best) { best = cur; }
  prev = s;
}
if (cur > 0) runs.push([runStart, prev.hour, cur]);
runs.sort((a, b) => b[2] - a[2]);
console.log('=== (a) ALL-TIME >=50% STREAKS (top 6) ===');
for (const r of runs.slice(0, 6)) console.log(r[2] + 'h:', r[0], '->', r[1]);
console.log('BEST:', best);

console.log('\n=== (a) SPAM TRAJECTORY last 12h (streak check) ===');
for (const s of series.slice(-12)) {
  console.log(s.hour, 'spam=' + (s.push_spam_pct * 100).toFixed(1) + '%', 'minted=' + (s.minted || 0), 'demoted=' + s.demoted_total, 'events=' + s.events);
}

// (b) minting last 12h
console.log('\n=== (b) MINTING last 12h (factory re-arm?) ===');
for (const s of series.slice(-12)) console.log(s.hour.slice(11), 'minted=' + (s.minted || 0));

// (c) ledger stats
const ledger = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', 'farm_actors.json'), 'utf8'));
console.log('\n=== LEDGER ===');
console.log('ledger entries:', Object.keys(ledger).length);
const confirmed = Object.values(ledger).filter(e => (e.hours || []).length >= 2).length;
console.log('confirmed (>=2h):', confirmed);
const batch = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  if (hrs[0]) batch[hrs[0]] = (batch[hrs[0]] || 0) + 1;
}
const lastHrs = series.slice(-3).map(s => s.hour);
console.log('minted last 3h:', lastHrs.map(h => h + ':' + (batch[h] || 0)).join('  '));
let mintSum = 0; for (const h of lastHrs) mintSum += batch[h] || 0;
console.log('mint total last 3h:', mintSum);

// (d) key actors persistence
console.log('\n=== KEY ACTORS (ledger presence) ===');
for (const a of ['ugmoddev', 'elad-cmd', 'zerotraceh1', 'loganfoxdale', 'danialzivehdadr', 'bogdanstancu1119-maker', 'Fadil123-hah', 'ankitkapur1992-hlido', 'twainswee', 'spl1ce']) {
  const e = ledger[a.toLowerCase()] || ledger[a];
  if (e) {
    const hrs = (e.hours || []).sort();
    console.log(a.padEnd(22), 'first:' + hrs[0], 'last:' + hrs[hrs.length - 1], 'hours:' + hrs.length);
  } else console.log(a.padEnd(22), 'NOT IN LEDGER');
}

// (e) last 3h bot_watch top farms
console.log('\n=== BOT WATCH last 3h (top 6 per hour) ===');
for (const s of series.slice(-3)) {
  const bw = (s.bot_watch || []).slice(0, 6).map(r => r.repo + '(' + r.pushes + ')').join('  ');
  console.log(s.hour, 'n=' + (s.bot_watch || []).length, bw);
}

// (f) last 3h top actors overall (farm-relevant, excluding shared bots)
console.log('\n=== TOP NON-SHARED ACTORS last 3h ===');
const shared = /\[bot\]$|^github-actions|^dependabot|^renovate|^cursor|^pull|^swa-runner|^rkenagy-ops/;
for (const s of series.slice(-3)) {
  const ta = (s.top_actors || []).filter(a => !shared.test(a.actor)).slice(0, 8).map(a => a.actor + '(' + a.events + ')').join('  ');
  console.log(s.hour, ta);
}

// (g) demotions
console.log('\n=== DEMOTIONS last 3h ===');
for (const s of series.slice(-3)) console.log(s.hour, 'demoted=' + s.demoted_total);
const demos = series.slice().sort((a, b) => b.demoted_total - a.demoted_total).slice(0, 15);
console.log('top-15 all-time:', demos.map(x => x.hour + ':' + x.demoted_total).join(' | '));

// (h) Janfindl / elad-cmd / ugmoddev traces last 48h via farm_actors hours? use bot_watch actor_names
console.log('\n=== ugmoddev bot_watch presence last 24h ===');
for (const s of series.slice(-24)) {
  const has = (s.bot_watch || []).some(r => (r.actor_names || []).includes('ugmoddev'));
  console.log(s.hour, has ? 'X' : '.');
}

// (i) elad-cmd last 24h
console.log('\n=== elad-cmd bot_watch presence last 24h ===');
for (const s of series.slice(-24)) {
  const has = (s.bot_watch || []).some(r => (r.actor_names || []).includes('elad-cmd'));
  console.log(s.hour, has ? 'X' : '.');
}
