// run44_probe.cjs — anomaly deep-dives for v5.30
const fs = require('fs');
const path = require('path');
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).sort(cmp);
const series = [];
for (const f of files) series.push(JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')));
series.sort((a, b) => cmp(a.hour, b.hour));
const byHour = {}; for (const s of series) byHour[s.hour] = s;

// 1) bogdanstancu1119-maker — why invisible? check its repos in snapshot flagged state
console.log('=== bogdanstancu: repo-level flags last 3h ===');
for (const h of ['2026-08-17-1', '2026-08-17-2', '2026-08-17-3']) {
  const s = byHour[h];
  const rel = (s.bot_watch || []).concat(s.farms || []).filter(r => String(r.repo || '').toLowerCase().includes('bogdanstancu'));
  // find any repo owned by bogdanstancu in top_hot/top_active? use farms only + look at all flagged
  const flagged = (s.bot_watch || []).map(r => r.flag + ':' + r.repo);
  console.log(h, 'bot_watch flagged:', flagged.length ? flagged.join(', ') : '(none)');
  console.log('  bogdan in any list:', rel.length ? JSON.stringify(rel).slice(0, 300) : 'no');
}
// does snapshot expose per-repo flags anywhere else? try s.demoted
console.log('\n=== bogdan: demoted entries last 3h ===');
for (const h of ['2026-08-17-1', '2026-08-17-2', '2026-08-17-3']) {
  const s = byHour[h];
  const dm = (s.demoted || []).filter(r => String(r.repo || '').toLowerCase().includes('bogdanstancu'));
  console.log(h, dm.length ? dm.map(r => r.repo + '(' + r.flag + ',' + r.pushes + ')').join(' ') : 'none');
}

// 2) loganfoxdale — where seen h1-h3?
console.log('\n=== loganfoxdale: any list presence h1-h3 ===');
for (const h of ['2026-08-17-1', '2026-08-17-2', '2026-08-17-3']) {
  const s = byHour[h];
  const bw = (s.bot_watch || []).filter(r => (r.actor_names || []).includes('loganfoxdale') || String(r.repo).startsWith('loganfoxdale'));
  const dm = (s.demoted || []).filter(r => String(r.repo).startsWith('loganfoxdale'));
  const ta = (s.top_actors || []).filter(a => a.actor === 'loganfoxdale');
  console.log(h, 'bot_watch:', bw.length, 'demoted:', dm.map(r => r.repo).join(','), 'top_actors:', ta.length ? ta[0].events : '-');
}

// 3) zerotraceh1 — trace last 48h via top_actors + bot_watch
console.log('\n=== zerotraceh1: top_actors events last 48h ===');
for (const s of series.slice(-24)) {
  const ta = (s.top_actors || []).filter(a => a.actor === 'zerotraceh1');
  const bw = (s.bot_watch || []).filter(r => (r.actor_names || []).includes('zerotraceh1'));
  if (ta.length || bw.length) console.log(s.hour, 'events:' + (ta.length ? ta[0].events : 0), 'bw:' + bw.map(r => r.repo + '(' + r.pushes + ')').join(','));
}

// 4) Fadil123-hah — trace last 24h
console.log('\n=== Fadil123-hah: top_actors last 24h ===');
for (const s of series.slice(-12)) {
  const ta = (s.top_actors || []).filter(a => a.actor === 'Fadil123-hah');
  const bw = (s.bot_watch || []).filter(r => (r.actor_names || []).includes('Fadil123-hah'));
  console.log(s.hour, 'events:' + (ta.length ? ta[0].events : 0), 'bw:' + bw.map(r => r.repo + '(' + r.pushes + ')').join(','));
}

// 5) new real-word tier h1-h3: flintassemblyduel, Fueltricharge, SkinCorporal, SailorEnliven, animal-lover12
console.log('\n=== NEW real-word actors traces (top_actors, last 48h) ===');
for (const a of ['flintassemblyduel', 'Fueltricharge', 'SkinCorporal', 'SailorEnliven', 'animal-lover12', 'contrerasjake7319']) {
  const trace = [];
  for (const s of series.slice(-16)) {
    const ta = (s.top_actors || []).filter(x => x.actor === a);
    trace.push(s.hour.slice(11) + ':' + (ta.length ? ta[0].events : 0));
  }
  console.log(a.padEnd(20), trace.join(' '));
}

// 6) elad-cmd trace last 24h via top_actors
console.log('\n=== elad-cmd top_actors last 24h ===');
for (const s of series.slice(-24)) {
  const ta = (s.top_actors || []).filter(a => a.actor === 'elad-cmd');
  if (ta.length) console.log(s.hour, ta[0].events);
}

// 7) biggest mint hours all-time (batch by first_seen)
const ledger = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', 'farm_actors.json'), 'utf8'));
const batch = {};
for (const e of Object.values(ledger)) {
  const hrs = (e.hours || []).slice().sort(cmp);
  if (hrs[0]) batch[hrs[0]] = (batch[hrs[0]] || 0) + 1;
}
console.log('\n=== ALL-TIME MINT HOURS (top 10) ===');
Object.entries(batch).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([h, n]) => console.log(h, n));

// 8) ugmoddev zombie check h1-h3 details
console.log('\n=== ugmoddev last 6h: bot_watch repos ===');
for (const s of series.slice(-6)) {
  const bw = (s.bot_watch || []).filter(r => (r.actor_names || []).includes('ugmoddev'));
  console.log(s.hour, bw.length ? bw.map(r => r.repo + '(' + r.pushes + ')').join(',') : '-');
}
