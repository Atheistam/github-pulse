// probe_bogdan.cjs — ledger entry for bogdanstancu1119-maker + bot_watch visibility
const fs = require('fs');
const path = require('path');
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', 'farm_actors.json'), 'utf8'));
const e = d['bogdanstancu1119-maker'];
if (e) {
  const hrs = (e.hours || []).sort();
  console.log('ledger hours:', hrs.length, 'first:', hrs[0], 'last:', hrs[hrs.length - 1], 'lastSeen:', e.lastSeen);
} else {
  console.log('not in ledger');
}
// check bot_watch visibility across last few hours
const HIST = path.join(__dirname, '..', 'site', 'data', 'history');
const files = fs.readdirSync(HIST).filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).sort();
const last = files.slice(-12);
for (const f of last) {
  const s = JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));
  const bw = (s.bot_watch || []).filter(r => (r.actor_names || []).some(a => String(a).toLowerCase().includes('bogdanstancu')));
  const topAct = (s.top_actors || []).filter(a => String(a.actor || '').toLowerCase().includes('bogdanstancu'));
  const farm = (s.farms || []).filter(r => String(r.repo || '').toLowerCase().includes('bogdanstancu'));
  console.log(s.hour, 'bot_watch:', bw.length, 'top_actors:', topAct.length ? topAct.map(a => a.events).join(',') : '-', 'farms:', farm.length);
}
