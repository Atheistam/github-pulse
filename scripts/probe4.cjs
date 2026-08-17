// probe4.cjs — loganfoxdale/zerotraceh1/Fadil123-hah in Aug16 h1-h3 AND Aug17 h1-h3 archives
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const targets = ['loganfoxdale', 'zerotraceh1', 'Fadil123-hah', 'fadil123-hah', 'elad-cmd', 'ugmoddev', 'srjordan6'];

async function probe(label, file) {
  if (!fs.existsSync(file)) { console.log(label, 'no file'); return; }
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const ev = {}; const push = {}; const repos = {};
  let lines = 0;
  rl.on('line', (line) => {
    lines++;
    let e; try { e = JSON.parse(line); } catch { return; }
    const login = (e.actor && e.actor.login) || '';
    const t = targets.find(t => t.toLowerCase() === login.toLowerCase());
    if (t) {
      ev[t] = (ev[t] || 0) + 1;
      if (e.type === 'PushEvent') { push[t] = (push[t] || 0) + 1; repos[t] = repos[t] || {}; const r = (e.repo && e.repo.name) || '?'; repos[t][r] = (repos[t][r] || 0) + 1; }
    }
  });
  await new Promise((res) => rl.on('close', res));
  console.log('=== ' + label + ' lines=' + lines + ' ===');
  for (const t of targets) {
    if (ev[t]) {
      const topRepos = Object.entries(repos[t] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => r + 'x' + n).join(' ');
      console.log('  ' + t.padEnd(15), 'events=' + ev[t], 'pushes=' + (push[t] || 0), '|', topRepos);
    }
  }
}

(async () => {
  await probe('AUG16-h1', '/tmp/g16-1.json.gz');
  await probe('AUG16-h2', '/tmp/g16-2.json.gz');
  await probe('AUG16-h3', '/tmp/g16-3.json.gz');
})();
