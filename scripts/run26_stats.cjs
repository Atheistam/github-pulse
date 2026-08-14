const fs = require('fs');
const path = require('path');
const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const files = fs.readdirSync('site/data/history').filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).sort(cmp);
const s = [];
for (const f of files) { const h = JSON.parse(fs.readFileSync(path.join('site/data/history', f), 'utf8')); s.push(h); }
s.sort((a, b) => cmp(a.hour, b.hour));
let low = s[0], high = s[0];
for (const x of s) { if (x.push_spam_pct < low.push_spam_pct) low = x; if (x.push_spam_pct > high.push_spam_pct) high = x; }
console.log('LOWEST spam:', low.hour, low.push_spam_pct + '%');
console.log('HIGHEST spam:', high.hour, high.push_spam_pct + '%');
const drops = [], rises = [];
for (let i = 1; i < s.length; i++) {
  const d = s[i].push_spam_pct - s[i - 1].push_spam_pct;
  if (d < 0) drops.push({ h: s[i].hour, d }); else rises.push({ h: s[i].hour, d });
}
drops.sort((a, b) => a.d - b.d); rises.sort((a, b) => b.d - a.d);
console.log('BIGGEST 1h DROPS:', drops.slice(0, 4).map(x => x.h + ' ' + x.d.toFixed(1) + 'pt').join(' | '));
console.log('BIGGEST 1h RISES:', rises.slice(0, 4).map(x => x.h + ' +' + x.d.toFixed(1) + 'pt').join(' | '));
const breaches = s.filter(x => x.push_spam_pct >= 50).map(x => x.hour + ' ' + x.push_spam_pct + '%');
console.log('>=50% breaches (' + breaches.length + '):', breaches.join(', '));
const ledger = JSON.parse(fs.readFileSync('site/data/farm_actors.json', 'utf8'));
const b = {};
for (const e of Object.values(ledger)) { const hrs = (e.hours || []).slice().sort(cmp); if (hrs[0]) b[hrs[0]] = (b[hrs[0]] || 0) + 1; }
const start = s[s.length - 14];
const mintSer = [];
for (const x of s.filter(h => cmp(h.hour, start.hour) >= 0)) { mintSer.push(x.hour.slice(-5) + ':' + (b[x.hour] || 0)); }
console.log('minting last 14h:', mintSer.join(' '));
const last = s[s.length - 1];
console.log('last hour events:', last.events, 'repos:', last.repos_seen);
console.log('history:', s[0].hour, '->', last.hour, '(' + s.length + 'h)');
// events total
let tot = 0; for (const x of s) tot += x.events || 0;
console.log('total events:', tot.toLocaleString());
