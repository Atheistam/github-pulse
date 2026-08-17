// probe3.cjs — Fadil ledger (lowercase), bogdan repo human-signal in h3, ugmoddev/elad repos h1-h3
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

(async () => {
  // 1) Fadil ledger entry
  const d = JSON.parse(fs.readFileSync('/Users/bolero/rogue-dev/site/data/farm_actors.json', 'utf8'));
  const fad = d['fadil123-hah'] || d['Fadil123-hah'];
  console.log('fadil123-hah:', fad ? 'n=' + fad.hours.length + ' first=' + fad.hours[0] + ' last=' + fad.hours[fad.hours.length - 1] : 'NOT IN LEDGER');

  // 2) bogdan repos in h3: event types touching his repos (stars? forks? others?)
  const file = '/tmp/gh3.json.gz';
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const repoTypes = {};
  let bogdanRepoEvents = 0;
  rl.on('line', (line) => {
    let e; try { e = JSON.parse(line); } catch { return; }
    const repo = (e.repo && e.repo.name) || '';
    if (repo.startsWith('bogdanstancu1119-maker/')) {
      bogdanRepoEvents++;
      const t = e.type;
      repoTypes[t] = (repoTypes[t] || 0) + 1;
    }
  });
  await new Promise((res) => rl.on('close', res));
  console.log('bogdan repo events in h3:', bogdanRepoEvents, JSON.stringify(repoTypes));
})();
