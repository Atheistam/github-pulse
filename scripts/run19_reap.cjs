// Run 19: reap our zombie headless firefox processes (hn-ff-*, pulse-ff-*)
// Careful: only targets profiles created by our own scripts in /var/folders tmp.
const { execSync } = require('child_process');
const out = execSync("pgrep -fl 'firefox'", { encoding: 'utf8' });
const lines = out.split('\n').filter(Boolean);
let killed = 0;
for (const line of lines) {
  const m = /^(\d+) .*?(hn-ff-|pulse-ff-|pulse-shot-)/.exec(line);
  if (m) {
    try { execSync(`kill -9 ${m[1]} 2>/dev/null`); console.log('killed', m[1], m[2]); killed++; } catch {}
  }
}
console.log('reaped', killed, 'zombie(s)');
