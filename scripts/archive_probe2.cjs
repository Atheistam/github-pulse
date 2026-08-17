// archive_probe2.cjs — definitive: which actors/repos exist in h1/h2/h3 archives
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const actors = ['bogdanstancu1119-maker', 'loganfoxdale', 'ugmoddev', 'elad-cmd', 'zerotraceh1'];

async function probe(h) {
  const file = `/tmp/gh${h}.json.gz`;
  if (!fs.existsSync(file)) { console.log('h' + h, 'no file'); return; }
  const raw = fs.createReadStream(file);
  const rl = readline.createInterface({ input: raw.pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let lines = 0;
  const actorEvents = {};
  const actorPush = {};
  const loganRepos = {}; // repo -> set of pushers
  const loganAny = [];
  rl.on('line', (line) => {
    lines++;
    let e; try { e = JSON.parse(line); } catch { return; }
    const login = (e.actor && e.actor.login) || '';
    if (actors.includes(login)) {
      actorEvents[login] = (actorEvents[login] || 0) + 1;
      if (e.type === 'PushEvent') actorPush[login] = (actorPush[login] || 0) + 1;
    }
    const repo = (e.repo && e.repo.name) || '';
    if (repo.startsWith('loganfoxdale/')) {
      loganRepos[repo] = loganRepos[repo] || new Set();
      loganRepos[repo].add(login + ':' + e.type);
      if (loganAny.length < 5) loganAny.push(login + ' ' + e.type + ' ' + repo);
    }
    // also any event mentioning bogdanstancu anywhere (org, pusher, etc.)
    if (line.includes('bogdanstancu') && !actors.includes(login)) {
      // count only if really referencing; skip — actorEvents covers actor field
    }
  });
  await new Promise((res) => rl.on('close', res));
  console.log('=== h' + h + ': lines=' + lines + ' (snapshot events: h1=166262 h2=166174 h3=170286) ===');
  for (const a of actors) {
    if (actorEvents[a]) console.log('  ' + a.padEnd(22), 'events=' + actorEvents[a], 'pushes=' + (actorPush[a] || 0));
  }
  const lr = Object.entries(loganRepos);
  if (lr.length) {
    console.log('  loganfoxdale repos touched:', lr.length);
    for (const [r, s] of lr.slice(0, 10)) console.log('    ' + r, '->', [...s].slice(0, 6).join(', '));
  }
}

(async () => { for (const h of [1, 2, 3]) await probe(h); })();
