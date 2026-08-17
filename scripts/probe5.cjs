// probe5.cjs — h12-cohort test: do the 46 "h12-only" actors appear in Aug17 h1-h3 archives?
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const cohort = ['loganfoxdale','riveraaaron29','barnesjoseph119','ramirezjeffery3559','mccallglen1874','willischristopher68','flemingnicholas42','harrismisty4151','creephezs','ryojimovent','brioaj','lawsonkimberly845','oWaBFhwm31','VzmCQqDAxN03','ksHSbkGfGJaqi62','oLNebcboF19','CTEcGgeaX67','iOBjaRim89','williamsjacob1','floresjoseph4','wimcarm77','noahanderson828871','paxpylen','johnsonm444020','mia32693','hoku104','smithn29702','aanderson31430','luna-moore01471','mia-thomas446936','warlanage211','olivia-taylor554147','stormart01','reinatomait','craigsonde','andersonsusan8983','twainswee','spl1ce','sandeepkollu7359','jeepv46syj98','nuanton','yonghuy','panelzey-zueng','awanahaupalio','avksarkar','cfdtrhyllc92'];
const lower = new Set(cohort.map(c => c.toLowerCase()));
const found = {};

async function scan(file, hourLabel) {
  if (!fs.existsSync(file)) { console.log(hourLabel, 'no file'); return; }
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  rl.on('line', (line) => {
    // fast pre-filter
    if (!/[A-Za-z0-9]/.test(line)) return;
    let e; try { e = JSON.parse(line); } catch { return; }
    const login = ((e.actor && e.actor.login) || '').toLowerCase();
    if (lower.has(login)) {
      found[login] = found[login] || [];
      found[login].push(hourLabel + ':' + (e.type === 'PushEvent' ? (e.repo && e.repo.name || '?') : e.type));
    }
  });
  await new Promise((res) => rl.on('close', res));
}

(async () => {
  await scan('/tmp/gh1.json.gz', '17-h1');
  await scan('/tmp/gh2.json.gz', '17-h2');
  await scan('/tmp/gh3.json.gz', '17-h3');
  await scan('/tmp/g16-1.json.gz', '16-h1');
  await scan('/tmp/g16-2.json.gz', '16-h2');
  await scan('/tmp/g16-3.json.gz', '16-h3');
  const hits = Object.entries(found).filter(([k, v]) => v.length);
  console.log('cohort actors with archive activity outside h12:', hits.length, 'of', cohort.length);
  for (const [k, v] of hits.slice(0, 40)) console.log('  ' + k.padEnd(24), v.join(' | '));
  // also: how many have activity ONLY at h12 within these 6 files? (they'd have no hits here)
  const zero = cohort.filter(c => !found[c.toLowerCase()]);
  console.log('cohort actors with NO activity in these 6 night hours:', zero.length);
  console.log(zero.join(', '));
})();
