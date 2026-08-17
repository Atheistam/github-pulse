#!/usr/bin/env node
/* pipeline/report.cjs — generates site/report.html ("State of GitHub Spam").
 * Zero dependencies. Reads site/data/history/*.json, aggregates, renders a
 * self-contained static page (inline CSS + inline SVG charts).
 * Regenerates on every refresh; safe to run any time.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HIST = path.join(ROOT, 'site', 'data', 'history');
const OUT = path.join(ROOT, 'site', 'report.html');
const SITE_DATA = path.join(ROOT, 'site', 'data');

const files = fs.readdirSync(HIST)
  .filter(f => /^\d{4}-\d{2}-\d{2}-\d+\.json$/.test(f))
  .sort((a, b) => {
    // chronological, not lexicographic: 2026-08-13-19 < 2026-08-13-2
    const key = f => { const p = f.replace('.json', '').split('-'); return Date.parse(p.slice(0, 3).join('-') + 'T00:00:00Z') / 86400000 * 24 + Number(p[3]); };
    return key(a) - key(b);
  });
if (!files.length) { console.error('no history files'); process.exit(1); }

const hours = files.map(f => JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')));

// ---------- spray-farm radar (v5.31: actors whose total push volume is high
// but spread thin across many repos — every repo under the top-15 cutoff, so
// they are invisible in bot_watch/demoted top lists) ----------
let sprayRadar = null;
try { sprayRadar = JSON.parse(fs.readFileSync(path.join(SITE_DATA, 'spray.json'), 'utf8')); } catch {}

// ---------- aggregates ----------
const series = hours.map(h => ({
  hour: h.hour,
  label: h.hour.slice(5),                       // MM-DD-H
  day: h.hour.slice(5, 10),
  events: h.events || 0,
  repos: h.repos_seen || 0,
  spam: h.push_spam_pct || 0,
  farms: (h.bot_watch || []).length,
  farmPushes: (h.bot_watch || []).reduce((a, b) => a + (b.pushes || 0), 0),
  demoted: h.demoted_total || 0,
  suspicious: h.suspicious_total || 0,
  starLoops: (h.star_radar && h.star_radar.loops) || 0,
  starOnly: (h.star_radar && h.star_radar.repos - h.star_radar.loops) || 0,
  watchers: (h.star_radar && h.star_radar.watch_only_actors) || 0,
}));

const totalEvents = series.reduce((a, s) => a + s.events, 0);
const totalRepos  = series.reduce((a, s) => a + s.repos, 0);
const avgSpam     = series.reduce((a, s) => a + s.spam, 0) / series.length;
const cur = series[series.length - 1];
const maxSpam = series.reduce((a, s) => (s.spam > a.spam ? s : a), series[0]);
const maxFarms = series.reduce((a, s) => (s.farmPushes > a.farmPushes ? s : a), series[0]);
const maxDemoted = series.reduce((a, s) => (s.demoted > a.demoted ? s : a), series[0]);
const totalDemoted = series.reduce((a, s) => a + s.demoted, 0);
const totalSuspicious = series.reduce((a, s) => a + s.suspicious, 0);

// all-time persistent farm ledger (best view per repo across hours)
const farms = new Map();
for (const h of hours) {
  for (const f of (h.botnet_watch || [])) {
    const e = farms.get(f.repo) || { repo: f.repo, hours_seen: 0, max_pushes: 0, first: f.first_seen, last: f.last_seen };
    e.hours_seen = Math.max(e.hours_seen, f.hours_seen || 0);
    e.max_pushes = Math.max(e.max_pushes, f.max_pushes || 0);
    if (f.first_seen && f.first_seen < e.first) e.first = f.first_seen;
    if (f.last_seen && f.last_seen > e.last) e.last = f.last_seen;
    farms.set(f.repo, e);
  }
}
const farmList = [...farms.values()]
  .sort((a, b) => b.hours_seen - a.hours_seen || b.max_pushes - a.max_pushes);

// ---------- cadence & account factory (v5.7) ----------
// spam peaks = local maxima >= 50% of push_spam_pct
const peaks = [];
for (let i = 1; i < series.length - 1; i++) {
  const a = series[i - 1], b = series[i], c = series[i + 1];
  if (b.spam >= 50 && b.spam > a.spam && b.spam >= c.spam) peaks.push(b);
}
// new-account batches = farm-ledger actors by first_seen hour
const LEDGER = path.join(ROOT, 'site', 'data', 'farm_actors.json');
const batchByHour = {};
let ledgerCount = 0;
try {
  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  ledgerCount = Object.keys(ledger).length;
  for (const e of Object.values(ledger)) {
    const key = h => { const p = h.split('-'); return Date.parse(p.slice(0, 3).join('-') + 'T00:00:00Z') / 86400000 * 24 + Number(p[3]); };
    const hrs = (e.hours || []).slice().sort((x, y) => key(x) - key(y)); // chronological: hour labels are NOT zero-padded
    if (hrs[0]) batchByHour[hrs[0]] = (batchByHour[hrs[0]] || 0) + 1;
  }
} catch (e) { /* ledger unavailable -> cadence panel degrades to peaks only */ }
const hourNum = h => parseInt(h.split('-')[3], 10);
const padH = h => { const p = h.split('-'); p[3] = String(hourNum(h)).padStart(2, '0'); return p.join('-'); };
const batchAt = h => batchByHour[h] || batchByHour[padH(h)] || 0;
const cadenceRows = peaks.map(pk => {
  const hh = hourNum(pk.hour), day = pk.hour.slice(0, 10);
  let lead = null, maxBatch = 0, leadBatch = 0;
  for (let k = 0; k <= 4; k++) {
    const b = batchAt(day + '-' + String(hh - k));
    if (b > maxBatch) maxBatch = b;
    if (b >= 500 && lead === null) { lead = k; leadBatch = b; }
  }
  return { hour: pk.hour, label: pk.hour.slice(5), spam: pk.spam, lead, leadBatch, maxBatch };
});
const factorySurges = cadenceRows.filter(r => r.lead !== null).length;
const leadAvg = (() => {
  const ls = cadenceRows.filter(r => r.lead !== null).map(r => r.lead);
  return ls.length ? (ls.reduce((a, b) => a + b, 0) / ls.length).toFixed(1) : 'n/a';
})();

// ---------- v5.8 epilogue: the cadence breaks ----------
const lastPeak = peaks.length ? peaks[peaks.length - 1] : null;
const hoursSincePeak = lastPeak ? series.length - 1 - series.findIndex(s => s.hour === lastPeak.hour) : null;
const recent7 = series.slice(-7).map(s => s.spam);
const recentAvg = recent7.length ? (recent7.reduce((a, b) => a + b, 0) / recent7.length).toFixed(1) : null;
const recentMax = recent7.length ? Math.max(...recent7) : null;
const mintRecent = ['2026-08-14-1', '2026-08-14-2', '2026-08-14-3']
  .map(h => [h, batchAt(h)]).filter(x => x[1] > 0);
const mintNow = batchAt('2026-08-14-3');

// ---------- v5.10 verdict: the surge lands (outer edge) ----------
const verdictMint = ['2026-08-14-2', '2026-08-14-3', '2026-08-14-4', '2026-08-14-5', '2026-08-14-6']
  .map(h => [h, batchAt(h)]).filter(x => x[1] > 0);
const vSpam = ['2026-08-14-4', '2026-08-14-5', '2026-08-14-6']
  .map(h => { const s = series.find(x => x.hour === h); return s ? s.spam : null; })
  .filter(x => x !== null);
const vDemoted6 = (() => {
  const s = series.find(x => x.hour === '2026-08-14-6');
  return s ? (s.demoted || []).length : 0;
})();

// all-time languages (summed event-weight per hour it charted)
const langs = new Map();
for (const h of hours) {
  for (const l of (h.top_languages || [])) {
    const e = langs.get(l.language) || { language: l.language, events: 0, hours: 0 };
    e.events += l.events || 0; e.hours++;
    langs.set(l.language, e);
  }
}
const langList = [...langs.values()].sort((a, b) => b.events - a.events).slice(0, 12);

// hot-chart regulars (repos that keep appearing in the top-25)
const hot = new Map();
for (const h of hours) {
  for (const r of (h.top_hot || [])) {
    const e = hot.get(r.repo) || { repo: r.repo, appears: 0, heat: 0 };
    e.appears++; e.heat += r.heat || 0;
    hot.set(r.repo, e);
  }
}
const hotList = [...hot.values()].sort((a, b) => b.appears - a.appears || b.heat - a.heat).slice(0, 10);

const n = series.length;
const firstLabel = series[0].hour;
const lastLabel = series[n - 1].hour;

// v5.2 star-bomb radar: latest radar state (from the newest hour that has one)
const radarHours = hours.filter(h => h.star_radar);
const curRadar = radarHours.length ? radarHours[radarHours.length - 1].star_radar : null;
const starLoopTotal = series.reduce((a, s) => a + (s.starLoops || 0), 0);

// ---------- helpers ----------
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = (x) => Math.round(x).toLocaleString('en-US');
const pct = (x) => (Math.round(x * 10) / 10).toFixed(1) + '%';

// cadence table rows (built after esc/fmt exist)
const cadenceTable = cadenceRows.slice(-10).reverse().map(r =>
  `<tr><td class="mono">${esc(r.label)}</td><td class="mono">${r.spam}%</td>` +
  `<td class="mono">${r.lead === null ? '—' : r.lead + 'h'}</td><td class="mono">${r.leadBatch ? fmt(r.leadBatch) : (r.maxBatch ? '≤' + fmt(r.maxBatch) : '—')}</td></tr>`
).join('');

// inline SVG sparkline/line chart — returns <svg> string
function lineChart(series, opts) {
  const W = 920, H = 240, PL = 46, PR = 14, PT = 18, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const vals = series.map(s => s[opts.key]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (opts.floor != null) lo = Math.min(lo, opts.floor);
  if (opts.ceil != null) hi = Math.max(hi, opts.ceil);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = (i) => PL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => PT + ih - ((v - lo) / (hi - lo)) * ih;
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  const grid = [0.25, 0.5, 0.75].map(g => {
    const y = PT + ih * g; const v = hi - (hi - lo) * g;
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="#1d1d2e" stroke-width="1"/><text x="${PL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="ax">${opts.unit ? Math.round(v) + opts.unit : v.toFixed(0)}</text>`;
  }).join('');
  const step = Math.max(1, Math.ceil(n / 14));
  const xl = series.map((s, i) => i % step === 0
    ? `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="ax">${esc(s.label)}</text>` : '').join('');
  const area = opts.fill ? `<polygon points="${PL},${PT + ih} ${pts.join(' ')} ${X(n - 1).toFixed(1)},${PT + ih}" fill="${opts.color}" opacity="0.12"/>` : '';
  const dots = opts.dots !== false ? pts.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.6" fill="${opts.color}"/>`).join('') : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label)}">
${grid}<line x1="${PL}" y1="${PT + ih}" x2="${W - PR}" y2="${PT + ih}" stroke="#2a2a40" stroke-width="1"/>${area}
<polyline points="${pts.join(' ')}" fill="none" stroke="${opts.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${xl}
</svg>`;
}

function bars(series, opts) {
  const W = 920, H = 200, PL = 46, PR = 14, PT = 14, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const vals = series.map(s => s[opts.key]);
  const hi = Math.max(...vals, 1);
  const bw = Math.min(26, iw / n - 3);
  const X = (i) => PL + (i + 0.5) * (iw / n);
  const step = Math.max(1, Math.ceil(n / 14));
  const bars = vals.map((v, i) => {
    const bh = Math.max(v > 0 ? 3 : 0, (v / hi) * ih);
    const y = PT + ih - bh;
    const hl = opts.hl ? series[i][opts.hl] : true;
    return `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${hl ? opts.color : '#2a2a40'}"><title>${esc(series[i].label)}: ${fmt(v)}${opts.unit || ''}</title></rect>`;
  }).join('');
  const xl = series.map((s, i) => i % step === 0
    ? `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="ax">${esc(s.label)}</text>` : '').join('');
  const grid = [0.25, 0.5, 0.75].map(g => {
    const y = PT + ih * g; const v = hi * (1 - g);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="#1d1d2e" stroke-width="1"/><text x="${PL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="ax">${Math.round(v)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label)}">${grid}${bars}${xl}</svg>`;
}

// ---------- narrative timeline (data-backed, from run history) ----------
const timeline = [
  { when: 'Aug 11 · 00:00 UTC', title: 'GitHub Pulse goes live', body: 'The first full hour of the public GitHub event stream is processed: 147K events across 39.8K repos. A live radar of everything happening on GitHub, ranked by heat.' },
  { when: 'Aug 11 · hours 0–6', title: 'The pattern emerges', body: 'The raw push stream hides a machine underneath: single actors pushing 200–700× per hour into freshly-created gibberish repos (smithhoward5868/faiucd, conleyricky202/babjhl…). Zero stars, zero issues, zero PRs — zero humans.' },
  { when: 'Aug 11 · hours 6–12', title: 'The farms adapt', body: 'Every push-volume threshold I set (40 → 30 → 25 → 24 pushes/hr) is matched within hours. Detection switches from thresholds to profiles: no human signal + ≤2 actors + auto-generated account names + a persistent ledger — repos rotate, accounts persist.' },
  { when: 'Aug 11 · 18:00 UTC', title: 'LiamBruhin/SillyStuff', body: 'The longest-running farm appears and never leaves: 13 consecutive hours, peaking at 690 pushes in a single hour. Still active 12 hours later (259/hr at Aug 12 06:00).' },
  { when: 'Aug 12 · 00:00 UTC', title: 'A new wave', body: 'trnfvn-/brnfvn- prefixed accounts arrive (CentiCloudStir, MicroEnvoyTwist, YuqiGuo-cx0) pushing 325–345/hr. The ledger catches them on hour one.' },
  { when: 'Aug 12 · 03:00–06:00 UTC', title: 'The upswing', body: 'Spam climbs from 34.6% to 58.5% of ALL pushes. Demoted farm repos jump from 983 to 2,503 per hour. The botnet economy is having a busy morning.' },
  { when: 'Aug 12 · hours 10–12', title: 'The self-PR adaptation', body: 'With push-only repos demoted, farms open PRs on their own repos to fake human signal (quoctuan21112009-maker/pull-request hit #2 hottest). Detection flips from "any PR counts" to "PRs by the pusher don\'t".' },
  { when: 'Aug 12 · hour 15', title: 'The issue-loop', body: 'The next mutation: zero pushes at all. Operators open 14–16 issues on their own fresh repos (meronrudy/usaBOXING_repo, spcsorg/daylens) to rank #3–4 hottest on issue-weight alone. Caught the same hour — self-authored issues now demote like self-PRs.' },
  { when: 'Aug 12 · hours 12–15', title: 'The wave regroups', body: 'Spam % swings like a tide: 63.8% → 43.4% → back to 54.9%. The farms don\'t disappear — they shift volume between shifts of accounts. LiamBruhin/SillyStuff has now pushed 690×/hr for 13+ hours straight, every hour, one actor.' },
  { when: 'Aug 12 · hour 18', title: 'Star-bomb radar (v5.2)', body: 'With pushes (×0.05–0.3), self-PRs and issue-loops (×0.3) all demoted, stars are the last untaxed heat vector (×8) — so star-bombing became the predicted next adaptation. The radar tracks pure-watcher accounts (whose only activity all hour is starring) and bare repos (stars with zero pushes/PRs/issues/releases). A ≥5-star burst appearing out of nowhere, or ≥2 watchers co-starring multiple bare repos, is demoted ×0.3 as a star-loop; anything ambiguous gets an informational 🔭 star-only badge instead of punishment. Historical replay: spinabot/brigade (7★, 7 lurker watchers, out of nowhere) WOULD have been caught; guillaumemeyer/watermarks-remover (4★) stays informational; famous repos (transformers, firecrawl) are never touched.' },
  { when: 'Aug 13 · hour 0', title: 'The bot-loop (v5.3)', body: 'The chart\'s quiet blind spot: a repo hot ONLY because release/CI automation churns pushes. TimSchoenle/actions hit #1 with 55 pushes from 3 shared [bot] accounts and zero human touch — indistinguishable from a farm by the ≤2-actor rules. New tier: zero non-bot actors + zero human signal + ≥10 pushes → 🤖 bot-loop, demoted ×0.3, never called a farm. Bonus: farms laundering pushes through GitHub Actions under a clean-looking owner now can\'t rank either.' },
  { when: 'Aug 13 · hour 3', title: 'The bot-review loophole (v5.4)', body: 'The bot-loop rule had a crack a day old: reviews counted as human signal no matter who wrote them. TimSchoenle/actions came back with 49 pushes from 4 all-bot actors (renovate[bot], actions-maintenance-bot[bot], automatic-release-manager[bot], github-actions[bot]) — and one bot-authored review was enough to keep it off the bot-loop tier and at #5 hottest. Fix: review authors are now tracked per repo; bot reviews and self-reviews (authored by the repo\'s own pushers — Wonder0208/androidtest was trying exactly that, 42 pushes + 1 self-review) count as zero human signal. Same hour both slipped through got caught: the chart is back to human repos (bun, vm0, EaseMotion-css).' },
  { when: "Aug 13 · hours 6–15", title: "The 3-hour cadence (v5.7)", body: "The spam share stops drifting and starts pulsing: 66.2% → 62.8% → 53.0% → 60.2%, a surge every ~3 hours with 23–40% lulls between. The 4th peak rebounded — not a farm in retreat. And the engine is visible: each surge is preceded within 1–2 hours by a minting run of ≥500 freshly-created throwaway accounts (1,081 + 1,721 in the two hours before the 66.2% peak). Aug 11's peaks had almost no fresh accounts — fleet rotation. Aug 12 onward: mint-and-burn. Twelve ledger actors have now been seen in every single hour of the 64-hour window." },
  { when: "Aug 13 · hours 18–24 → Aug 14 · hour 0", title: "The pulse breaks (v5.8)", body: "The cadence was a hypothesis, and it failed at the 5th expected beat: h18 landed at 43.6% instead of ~60%, and the next six hours stayed flat (38.6 / 36.3 / 37.4 / 38.8 / 40.4 / 38.7) — seven hours with no ≥50% surge. The cause is visible in the ledger: minting collapsed from 947 fresh accounts in the hour before the 60.2% peak to 77/hr the hour after, settling at ~100–150/hr. Sprint → trickle. The old guards (LiamBruhin/SillyStuff back up to 725 pushes/hr, ugmoddev/API-NEW-NAT-3-) never stopped pumping; the fleet just stopped minting at surge scale, so the synchronized bursts stopped with it. The rulebook flips: don't predict a peak at h21/h24 — watch the minting rate as the leading indicator. ~500+/hr minted = surge inbound; ~100/hr = flat." },
  { when: "Aug 14 · hours 1–3", title: "The factory restarts (v5.9)", body: "The lead-time rule gets its first live test. Hours 1–3 of Aug 14 mint 163 → 629 → 1,175 fresh throwaway ledger accounts — the strongest minting since the 60.2% peak — yet spam holds flat at 32.2 / 33.3 / 34.4%, and even the old guards downshift (LiamBruhin/SillyStuff 725 → 387 pushes/hr, ugmoddev 532 → 276). The factory is generating identities at sprint scale again while the surge hasn't landed. Either a ≥50% surge lands within ~1–4h of the 629/1,175 batches (rule confirmed, timing becomes predictable), or minting stops being a leading indicator and the farms have decoupled account creation from push bursts. Three distinct naming batches — glennjennifer427810-style, xongtle29-style, and bare numeric usernames (130556457) — hint the generation templates themselves are being rotated hourly." },
  { when: "Aug 14 · hours 4–6", title: "The surge lands (v5.10)", body: "Verdict: the lead-time rule held, at the outer edge of its window. Minting stayed hot (730 → 502 → 716 fresh accounts) while spam dipped to 27.0% at h4 — a false dawn, the minted batch not yet deployed — then climbed 37.6% → 49.6% by h6, the first ≥45% hour in 15. The surge was carried by the new batch, not the veterans: LiamBruhin/SillyStuff faded to 299 pushes/hr (from 725) and ugmoddev to 204 (from 532), while fresh accounts minted at h4/h5 — brownwhitney29, stephenspaul164, shepherdjohn909, joneswilliam18, thomaskatherine300 — each pushed 145–235×/hr. Mint-and-burn confirmed: mint ≥500/hr → deploy the batch 2–3h later → surge. 1,695 farm repos were demoted in h6 alone. The naming-generator rotation (firstname+digits → word+digits → bare numeric → firstname+digits again) is the factory's fingerprinting dodge." },
  { when: "Aug 14 · hours 7–9", title: "The breach lands — rule confirmed (v5.11)", body: "The formal ≥50% breach arrived at h8: spam 43.7% (h7, one pause hour) → 55.6% (h8) → 51.2% (h9). The run-23 prediction — minting 629/1,175 at h2/h3 → ≥50% surge — is fully confirmed; the timing landed at the outer edge +1 (h8, ~6h after the first ≥500 mint hour). The rotation is total: by h9 neither LiamBruhin nor ugmoddev appears in the top farm list at all — the surge is 100% fresh batch (sweeneyrachel2528 234, trujillojoshua139 230, thompsoncarrie2241 228, taylorlisa8 226, suttonveronica8 223, thomasmary5697 222 pushes/hr). Minting decelerated (h7 87 → h8 210 → h9 188 fresh accounts) — the batch is deployed, the factory is re-arming. Naming template: back to firstname+lastname+digits (template A), same as h4–h6." },
  { when: "Aug 14 · hours 10–12", title: "Double breach, fastest collapse, record re-arm (v5.12)", body: "The h8 breach didn't fade — it repeated: h10 hit 53.5%, the first back-to-back ≥50% pair since Aug 13, carried by a brand-new lowercase-gibberish batch (matkcrais 202, truilab-da 189, mouses61drg 186, mchaelheses2 183, lesiron-c 183 pushes/hr) while the sweeneyrachel batch vanished from the top-5 overnight. h11 decayed to 47.2% as ugmoddev re-ramped to 206/hr (first top-5 appearance since h8). Then h12 collapsed to 25.7% — a -21.5pt single-hour drop, the largest in the 85-hour window and the second-lowest hour ever — while the factory minted a RECORD 2,002 fresh accounts in that same hour, nearly double the previous peak (1,175 at h3). Naming generators rotated three templates in three hours (gibberish → hyphen+digits, winson-00178005-style → firstname+lastname+digits). The lead-time rule's next live test: 2,002 minted at h12 → next ≥50% surge window h13–h16." },
  { when: "Aug 14 · hours 13–15", title: "All-time low → record jump → surge peaks (v5.13)", body: "The lead-time rule's third live test — its strongest — passes. The 2,002-account mint at h12 was followed by the deepest lull ever: h13 fell to 22.5%, a new all-time low (previous low 23.4%), the batch sitting undeployed. Then the surge landed inside the predicted h13–h16 window with the second-biggest single-hour jump in 88 hours: h14 +32.7pt to 55.2%, h15 to 62.4% — the highest since Aug 13's 66.2% peak. The surge batch was minted and deployed within 1–2 hours, faster than any earlier cycle (2–6h). Rotation remained brutal: h12's top-5 was gone by h13; jvhoang took over as #1 farm with elad-cmd and ugmoddev re-ramping." },
  { when: "Aug 14 · hours 16–18", title: "The cycle compresses — 4th live test passed (v5.14)", body: "The post-peak lull never came. h16 dropped to 43.0% (−19.4pt) and h17 held 42.6%, but h18 re-breached at 59.5% (+16.9pt) — a new surge just 2 hours after the dip, tightening the peak-to-peak cadence to ~2–3h. The lead-time rule passed its fourth consecutive live test on the tightest lead ever: h17 minted 1,004 fresh accounts → breach at h18, 1 hour later. The re-breach ran on a fresh template-A batch (romerosabrina6 135/hr, colemanjeffrey5 130, weaverjames3017 128). ugmoddev became the first confirmed veteran farm: 95–157 pushes/hr for 10+ consecutive hours. Mint-and-burn is now fully industrial: mint at h17, deploy at h18, rotate before h20." },
  { when: "Aug 14 · hours 18–24 → Aug 15 · hour 0", title: "The siege — record 71.4%, the factory goes quiet (v5.15)", body: "The burst-and-rest regime is dead. Instead of collapsing after the h18 re-breach, spam held ≥50% for SEVEN consecutive hours — h18 59.5 → h19 62.1 → h20 64.0 → h21 64.6 → h22 52.6 → h23 50.5 — the longest breach streak in 97 hours — then h0 exploded to 71.4%, a new all-time high (previous peak 66.2% at Aug 13 h6), +20.9pt in one hour. And the record was set WITHOUT the factory: h0 minted just 18 fresh accounts. The veterans did the heavy lifting — ugmoddev hit record rates of 268–270 pushes/hr (double its earlier 95–157 pace) across two parallel repos, elad-cmd held 100–144/hr for 9 straight hours, and the h0 blowout ran on 11+ farms over 85/hr simultaneously (srjordan6/twoai-content debuting at 245/hr). ugmoddev is now the first confirmed 13h+ veteran farm. The h22 minting run (572 accounts) was the last meaningful re-arm; the lead-time rule still points the right direction, but the engine has changed — the surge no longer needs fresh identities. Naming-template rotation accelerated from template-A dominant (9/10 at h18) to gibberish-dominant (7/10 at h23), with new disguises: bot-suffix accounts (nekovach-commits) and legit-looking repo names (proxy-list, StockPredictions). Demotions hit a record 2,624 at h0; ledger 25,907 actors (21,645 confirmed)." },
  { when: "Aug 15 · hours 0–3", title: "The siege holds — plateau at 54%+, the factory restarts (v5.16)", body: "The record did not collapse. Instead of an h12-style −21.5pt crash, the 71.4% blowout decayed gently — h1 65.5% (third-highest hour ever), h2 55.7%, h3 54.4% — landing on a NEW steady state of 54–56%, double the 27% lulls of the burst-and-rest era. The ≥50% streak is now TEN consecutive hours (h18 → h3), still active, beating the previous max of 7. The factory's silence was a 2-hour pause, not abandonment: minting 18 → 46 → 575 → 708 (h0–h3), back to sprint scale — but now the minting runs DURING the plateau (h2/h3) rather than 1–6h before a surge, the last teeth of the lead-time rule pulled. The standing army persists: ugmoddev is now a 15-of-16-hour veteran (h13 → h3, only h19 missed), its rate actually RISING from 95–157/hr to a 166–270/hr band — no fatigue after 15 hours. But the h0 newcomers were one-hit wonders: srjordan6 (245/hr debut) vanished by h1, and the disguise repos (nekovach-commits/StockPredictions, SoliSpirit/proxy-list) were single-hour costumes, gone by h1. Naming rotates hourly (template A at h1 → A+gibberish at h2 → gibberish at h3), and h3 deployed a synchronized squad — 7+ actors all within 126–130 pushes/hr, one script. Ledger 26,719 (22,116 confirmed); demotions 2,460 / 2,451 / 1,776 across h1–h3." },
  { when: "Aug 15 · hours 4–6", title: "The plateau breaks — and the factory re-arms at record scale (v5.17)", body: "The 54–56% 'floor' was not a floor. The 10-hour ≥50% siege (h18 → h3) ended at h4: 40.5% (−13.9pt — the delayed version of the h12 crash the 71.4% record was supposed to avoid), then 41.8%, then h6 48.3% (+6.5pt) climbing back. Meanwhile the factory did something it hasn't done since the 2,002-account record: it re-armed at scale — 466 → 783 → 1,497 fresh accounts minted h4–h6, the biggest batch in 3 days. The h3 synchronized squad (chprotoo / favc17 / cburgegro at 129–130/hr) was gone by h4 — one-hit wonders exactly as predicted. ugmoddev just keeps going: 17 of 18 hours (h13 → h6, only h19 missed), 272/hr at h6 — record band — now running TWO parallel repos (API-NEW-NAT-3- 166 + noti-api-server 106). Repo names went full 6-char gibberish (avzkvn, vpjsdm, bqoued). Ledger 28,830 (23,661 confirmed); demotions 1,501 / 1,647 / 2,146; loops 2,464 at h6." },
  { when: "Aug 15 · hours 7–9", title: "The rule is reborn — mint 1,497 → dip → breach → 64.4% (v5.18)", body: "The v5.17 watch order — 'watch h7–h9 for the breach' — landed exactly on schedule. h7 fell to 32.2% (−16.1pt): the 1,497-account batch sat undeployed, the same fake-out that followed the 2,002 record (h12 → h13's 22.5% all-time low). Then h8 breached at 56.0% (+23.8pt, the 6th-biggest single-hour jump in 106h) and h9 hit 64.4% — the 5th-highest hour ever, wave radar SURGING. Mint-to-breach: 2 hours. The factory minted its biggest-ever 2-hour total (h6 1,497 + h7 1,084 = 2,581 fresh accounts) before decelerating (576 → 355 — deploy-then-re-arm). The surge was carried by a RETURNING veteran — zerotraceh1/er-forge-probe, the top farm at h22–h23 (185–194/hr), absent h0–h7, back at 137/131/hr — plus a NEW base64-style synchronized squad (J8F8k93gAj26, VPvZkLZTNHf19, ZGXVQhXOjKD29, aLGR5RKc89, 1gRU847VX48, all 74–79/hr) and the standing army (ugmoddev 20 of 21 hours at 180–194/hr across 2 repos, elad-cmd 80–85/hr). The h6 squad (jaievicenory10 / mistiane808 / tras82deep) was gone by h7 — the 3rd consecutive synchronized squad confirmed as one-hit wonders. Naming rotated 3 templates in 3 hours (lowercase gibberish → NEW base64-alphanumeric → template A). Demotions 1,508 / 2,379 / 2,657 — h9's 2,657 is the 2nd-biggest demotion hour ever (record: 2,624 at h0). Ledger 29,387 (25,073 confirmed); loops 1,928 at h9." },
  { when: "Aug 15 · hours 10–12", title: "The surge plateaus — rule holds, veterans go shift-based (v5.19)", body: "The reborn rule's wave did not collapse. Instead of a post-peak crash, spam held 62.8% → 62.4% → 61.0% (h10–h12), decaying just −1.4pt/hour from the 64.4% peak — five consecutive ≥50% hours (h8–h12), the second siege-like plateau in 36 hours, this time at a higher level (61–64% vs the 54–56% of the first). The factory re-armed MID-surge: minting 220 → 497 → 590 (h10–h12) — the third time it has minted during a plateau instead of before one, further burying the lead-time rule. The carriers rotated again: zerotraceh1/er-forge-probe ended its 5-hour run (137/131/139/104 → gone at h12); the base64 squad was the 4th consecutive synchronized squad confirmed as one-hit wonders; elad-cmd and Janfindl — both previously near-continuous — switched to a SHIFT pattern (active h8–h9, silent h10–h11, back at h12: 83 and 99 pushes/hr): the first evidence the farms are now cycling veterans, not just squads. ugmoddev never stopped — 23 of 24 hours (h13 Aug 14 → h12 Aug 15, only h19 missed) and present in all 109 tracked hours — though its rate finally eased from 194 to 104–129/hr. Fresh faces at h12: loganfoxdale/d3 (119/hr), noahanderson828871 (91/hr), paxpylen. Demotions kept climbing: 2,475 / 2,569 / 2,815 — h12's 2,815 is the 2nd-biggest demotion hour ever (record: 3,095 at Aug 11 h1). Ledger 28,674 actors." },
  { when: "Aug 15 · hours 13–15", title: "The plateau breaks — lull lasts one hour (v5.20)", body: "The 6-hour ≥50% run (h8–h13: 56.0 → 64.4 → 62.8 → 62.4 → 61.0 → 51.7%) finally crashed at h14: 37.0% (−14.7pt) — later and milder than the old −20pt collapses. The lull lasted exactly one hour: h15 re-breached at 57.1% (+20.1pt). 7 of the last 8 hours ≥50%. The factory minted 1,180 accounts in the crash hour itself (2nd-biggest mint ever, record 2,002) — the second mint-during-collapse in a row, 15 straight hours of minting. zerotraceh1's cycler rhythm confirmed (run h8–h11, 1h skip, back h13–h15); elad-cmd + Janfindl silent for 3h after their h12 shift; ugmoddev 26 of 27 hours and present in ALL 112 tracked hours, rate back to 201/hr at h15. New mixed-case alphanumeric disguises (7OG3nOTy50, M7yzM7AqO254). Demotions 2,402 / 1,873 / 2,791 — h15's 2,791 is the 3rd-biggest ever. Ledger 28,897." },
  { when: "Aug 15 · hours 16–18", title: "The one-hour lull is the rhythm — 65.8% without the factory (v5.21)", body: "The v5.20 pattern repeated beat-for-beat: h16 dipped to 46.7% (−10.4pt, sub-50 for exactly one hour), then h17 re-breached at 65.5% (+18.8pt) and h18 held 65.8% — the 3rd-highest hour ever (behind h0's 71.4% and Aug 13 h6's 66.2%), wave radar PEAK. Two consecutive one-hour lulls in a row (h14 → h15, h16 → h17): the lull is no longer an event, it's a rhythm. And this surge ran WITHOUT the factory: minting collapsed to 92/106 fresh accounts at h17/h18 (from 429 at h16) — the second record-strength surge on an idle factory, matching h0's 71.4% with only 18 minted. ugmoddev carried it alone at 257/hr (h17, record band) then 207; 30 of 31 hours, present in ALL 115 tracked hours. zerotraceh1 ran h13–h16 (99–137/hr) then cycled off again. elad-cmd returned for a single-hour shift at h16 (86/hr) — the shift cadence is now 8,9 → 12 → 16. Janfindl silent 6 hours straight (h13–h18): retired or long cooldown. Naming back to template A with 6-char gibberish repos standard issue (txcdvd, mnrchp, moafcl, nvmovq…). Demotions 2,944 (h17) and 2,853 (h18) = 2nd- and 3rd-biggest demotion hours EVER — two of the top-3 in a single window. Ledger 27,057 (23,487 confirmed); 48 of 115 hours ≥50%." },
  { when: "Aug 15 · hours 19–0", title: "The peak becomes a plateau — 8 straight hours ≥65% on a dead factory (v5.22)", body: "The 65.8% peak did not collapse — it became a floor. h19 67.5% → h20 69.7% (2nd-highest hour EVER, behind only h0's 71.4%) → h21 68.3% → h22 69.0% → h23 68.6% → h0 65.5%. Eight consecutive hours ≥50% (h17–h0), every single one ≥65% — the strongest sustained run in 121 hours, beating the 10-hour siege (which dipped into the 50s). And it ran with the factory effectively DEAD: minting fell to 31/88/22/20/34/50 fresh accounts (245 across six hours vs the 2,002 single-hour record) — the longest idle stretch ever measured. The one-hour-lull rhythm from v5.21 was itself a transition: h16 was the last dip. The standing army IS the surge: ugmoddev reached an all-time rate record of 359–364/hr at h23–h0 (121 of 121 tracked hours, dual repos), elad-cmd went FULL-TIME for the first time (87 → 111 → 126 → 153 → 131 → 183/hr, shift pattern dead), zerotraceh1 cycled h19–h23 (120–218/hr) then off at h0, and Janfindl hit 12 silent hours — retired. New actors: danialzivehdadr/qwen-codep (new #1 farm at h23–h0, 289/hr — a real-sounding repo name disguise), Kelisiqiang/markwon_formatter (plausible library name), 3215colt/iluxbk. Demotions h19 3,011 = 2nd-biggest hour EVER — four of the top-6 all-time demotion hours now sit in the last four windows. Ledger 26,167 (23,096 confirmed); 54 of 121 hours ≥50%." },
  { when: "Aug 16 · hours 1–3", title: "The crack was a one-hour dip — and the factory answered (v5.23)", body: "The 9-hour ≥50% siege (h17 → h1, eight of them ≥65%) finally cracked at h2: 48.5% (−4.8pt) — the first sub-50% hour since h16, ten hours earlier. The crack lasted exactly ONE hour: h3 re-breached at 68.9% (+20.4pt) — the 5th-highest hour ever and the biggest bounce since the h12 → h14 22.5% → 55.2% recovery. And this time the factory did what it hadn't done in nine hours: it re-armed — 575 fresh accounts minted at h2 (the dip hour itself, echoing the 2,002 record at h12), then 708 at h3. 1,283 new identities in 2h, ending the longest idle stretch ever measured (h17 → h1: 92/106/31/88/22/20/34/18/46). The lead-time rule — declared formally dead at v5.16 — returned with its tightest lead ever: mint h2 → breach h3, a 1-hour lead. The standing army shows its first fatigue in days: ugmoddev hit its all-time record 364/hr at h0 then decelerated 324 → 213 → 169 (still 124 of 124 tracked hours — 100% presence); elad-cmd's full-time streak reached 9 hours (h19 → h3) but eased from 183 to 111/hr; zerotraceh1 cycled off (off-stretches growing: 2h → 4h+); Janfindl now 18 silent hours — retired, confirmed. danialzivehdadr ran its 5-hour course (289/229/239/103 → gone at h3); new #1: ThatOneFrench/Yugioh-Artwork (196/hr debut). srjordan6 — Aug 15's one-hit wonder — RETURNED at h1 with 331/hr (twoai-content). rnfvn mutated again: rogerserik5208/rnfvn-SKFAVD. Demotions 2,161 / 2,082 / 2,562. Ledger 26,461 (23,539 confirmed); 56 of 124 hours ≥50%." },
  { when: "Aug 16 · hours 4–6", title: "The re-breach held — the dead came back — the factory loaded its biggest magazine since the record (v5.24)", body: "The one-hour crack at h2 was a blip: the siege resumed and held — h4 65.8% → h5 57.2% → h6 52.7%, four consecutive ≥50% hours (h3–h6) decaying at a normal −3 to −9pt/hr. Correction to v5.23's headline: the '575 minted h2 + 708 h3' was a script bug (an Aug 15/Aug 16 hour-collision in the minting lookup) — the real dip-hour minting was 192 (h2) and 274 (h3), so the 68.9% re-breach was NOT factory-driven: it was carried by the standing army (ugmoddev 169, elad-cmd 111) plus ThatOneFrench's 196/hr debut. The factory's real answer came after the hold — the biggest since the record: 968 fresh accounts at h5 + 1,553 at h6 = 2,521 in 2h, the 2nd-biggest 2h mint EVER (record 2,581, Aug 13) and the biggest single hour since the 2,002 (h12 Aug 14) — lead-time rule live test #3 armed at h7–h8. ugmoddev's fatigue confirmed, not a re-ramp (364 → 324 → 213 → 169 → 122 → 149 → 95, still 127 of 127 hours). elad-cmd's 12-hour full-time streak (h19→h5) broke at h6 (77 → 0). Janfindl — 'retired, confirmed' 12 hours earlier — resurrected at h6 with 123/hr (#2 farm, AFL_Live): deaths on the botnet are seasonal. zerotraceh1's off-stretch hit 8 hours (longest ever). ThatOneFrench crowned the new veteran (196/168/141/134, 4th straight hour at #1). srjordan6 = two-night one-hit wonder (331/hr at h1, gone by h2). Demotions 2,585 / 2,696 / 2,740. Ledger 27,158 (23,387 confirmed). 59 of 127 hours ≥50%." },
  { when: "Aug 16 · hours 7–9", title: "The biggest magazine ever fires — 5th live test passed (v5.25)", body: "The factory did NOT peak at h6 — it saved the biggest for h7. Minting 968 (h5) → 1,553 (h6) → 1,630 (h7, biggest single hour since the 2,002 record) → 867 (h8) → 608 (h9) = 5,626 fresh accounts in 5 hours; the h5–h7 triple (4,151) is the all-time 3-hour mint record. The wave it bought: h7 34.4% (−18.3pt, the deepest dip of the siege — the batch sat parked), h8 46.5%, h9 64.1% RE-BREACH (hair under the top-10 highest hours). Mint → dip → breach in 2–4h: the 5th consecutive lead-time live test passed. ugmoddev's decay is structural (95 → 74/hr, still 130 of 130 hours); elad-cmd off 4h+; Janfindl confirmed shift worker (3-on/1-off); zerotraceh1 NOT retired (returned 68/60/hr — weakest ever); ThatOneFrench's crown RETRACTED (4-hour shift, gone). NEW naming mutation: hyphen+digits (miller-e6513). Demotions: h9's 3,585 = ALL-TIME RECORD. Ledger 29,149; 130h gapless · 21.22M events; report v5.25 GREEN, deployed HTTP 200, SMOKE PASS, shot run39. HN: 49310247 alive ~21h (delayed-kill watch passed x3)." },
  { when: "Aug 16 · hours 10–12", title: "THE NOON RITUAL — a farm that punches the clock (v5.26)", body: "loganfoxdale/d3 pushed at EXACTLY hour 12 for SIX consecutive days (312/351/183/227/119/109/hr), same actor, same repo, cron-regular — found via full-trace replay because it is invisible in per-hour bot_watch. The 6th lead-time live test PASSED: h10 62.7% → h11 51.7% → h12 55.4% — four straight ≥50% hours (h9–h12), wave PEAK. ugmoddev OUT of the top-15 farms for the FIRST time in 133h (70/hr vs the 71 cutoff — still the 4th most-active actor overall; my earlier 'silent' read corrected). elad-cmd returned at h10 (75/hr) then off again; Janfindl's 3-on/1-off broke (off h9–h12 — the morning-shift pattern); zerotraceh1's fade confirmed (weakest-ever 68/60 then gone); the hyphen+digit squad = solo on/off shifts, NOT one-hits (83/0/64/0). NEW DISGUISE TIER: real-word usernames (forgetpwd, twainswee, spl1ce, janbeoty). DEMOTION RECORD SPREE: h9 3,585 record + h10 3,225 (2nd-biggest EVER) + h11 2,900 (6th) — three of the top-6 all-time demotion hours in one window. Factory magazine spent (5,626 h5–h9), re-arming 214/449/440. 133h gapless · 21.73M events; ledger 29,065; report v5.26 GREEN, deployed HTTP 200, SMOKE PASS, shot run40. HN: delayed-kill MEASURED — 49319786 created 13:14Z, #1 on /newest, dead within ~5 min; 49310247 still alive 24h+; Ask 49270205 alive 4 days; URL budget exhausted (survival was luck, not an unlock)." },
  { when: "Aug 16 · hours 13–15", title: "The plateau holds — 7 straight ≥50% hours; the noon ritual enters day six but decays (v5.27)", body: "The PEAK did not collapse — it plateaued again. h13 53.4% → h14 59.0% → h15 58.2%, making SEVEN consecutive ≥50% hours (h9–h15, 64.1 → 62.7 → 51.7 → 55.4 → 53.4 → 59.0 → 58.2) — the second-longest streak in 136h, behind only the 10-hour siege. The mid-window dip at h11 (51.7%) recovered without a crash: post-peak-collapse is falsified a third time. The noon ritual held for day six: loganfoxdale/d3 pushed 109/hr at EXACTLY hour 12 and ZERO pushes at h11, h13, h14, h15 — the h12-only fingerprint survived a full window of negative checks — but the ritual is decaying (351 → 183 → 227 → 119 → 109, −69% from peak). ugmoddev was OUT of the top-15 farms for the ENTIRE window (84/0/62/hr) — the structural fade is complete; it survives only as the #1 persistent botnet (API-NEW-NAT-3-, seen 11 of the last 13h). The demotion spree entered the record books: h14 3,277 (2nd-biggest hour ever) + h15 3,250 (3rd) — SIX of the top-12 all-time demotion hours now sit in the last 7 hours (h9–h15). The factory never stopped: minting 515/409/579 — steady ~500/hr production, no single-hour magazine, and the enforcement (3,000+/hr demotions) is running hotter than the minting. elad-cmd ran a single shift at h15 (70/hr, #1 farm) after 4h off; Janfindl's morning shift (h6–h8) is the confirmed pattern — off all window; the real-word disguise tier (twainswee, janbeoty) persisted 5h each — mid-duration shift workers, not one-hits. Ledger 29,153 actors (26,845 confirmed). 66 of 136 hours ≥50% · 22.24M events." },
  { when: "Aug 16 · hours 16–18", title: "The record is tied — a second 10-hour siege, and the factory goes quiet again (v5.28)", body: "The streak did not break — it tied the all-time record. h16 55.5% → h17 58.0% → h18 62.6% (+4.6pt, highest hour since h9's 64.1%) = TEN consecutive ≥50% hours (h9–h18), matching the Aug 14/15 siege (h18→h3) as the longest breach run ever measured — and this one is still alive, RISING at the end instead of decaying. Post-peak-collapse is falsified a FOURTH time. And the wave peaked with the factory nearly dead: minting collapsed from the ~500/hr steady-state to 174/146/64 fresh accounts (384 in 3h) — the second record-strength surge on a dead factory (after h0's 71.4% with 18 minted). The standing army carried it. The noon ritual's h12-only fingerprint survived ANOTHER full negative window (h11–h18 all zero except h12), day-six rate 109/hr (−69% from the 351 peak) — and a NEW synchronization: twainswee AND spl1ce both pushed exactly 75/hr at h12 and zero everywhere else in 48h: the 'ritual' may be one shared scheduler, not one actor. Janfindl's morning shift CONFIRMED day two: h6 123 / h7 77 / h8 89 — near-identical rates to day one (105/76/90), same 06:00–08:00Z window, cron-regular. ugmoddev ran zombie shifts (0/75/0) and re-opened a second parallel repo (noti-api-server, seen 3h, alongside API-NEW-NAT-3- at 8h) — the eternal #1 refuses to die, it just slows down. elad-cmd: single 80/hr shift at h17, gaps widening. Demotions stayed at enforcement-record levels (2,957/2,904/2,749) — NINE of the top-12 all-time demotion hours now sit in the last ~2 days. The h18 mint emitted a NEW disguise template: full realistic names (harringtonkevin8169, hendersonclinton466, butlerstephanie9380, haynescorey236) plus suffix accounts (-web, -ai, -ui, -debug, -collab). Ledger 27,289 (25,515 confirmed) — its first-ever decline (29,153 → 27,289: TTL pruning outran the mint, the farm population is contracting). 69 of 139 hours ≥50% · 22.74M events." },
  { when: "Aug 16 · hours 19–24 / Aug 17 · 0", title: "THE RECORD IS SHATTERED — a 16-hour siege, still alive, on a dead factory (v5.29)", body: "The tied record did not just break — it shattered. h19 65.6% → h20 64.7% → h21 64.1% → h22 66.2% (highest since h9) → h23 63.9% → h0 64.9% = SIXTEEN consecutive ≥50% hours (h9 Aug 16 → h0 Aug 17), obliterating the 10-hour all-time record — and the streak is STILL ALIVE at the end, hovering in a 63.9–66.2% band with no decay. Post-peak-collapse is falsified a FIFTH time. The factory never re-armed: minting 174/146/64/26/94/63/99/122/42 (~92/hr vs the ~500/hr steady-state; h19's 26 is the lowest mint hour ever measured) — the THIRD record-strength surge on a dead factory: the standing army IS the wave. THE NOON RITUAL IS A SCHEDULER, NOT AN ACTOR: a full-history scan found 46 actors whose activity is confined ENTIRELY to hour 12 — loganfoxdale (6/6 days, decaying 312→351→183→227→119→109) plus a fresh 3–14-account cohort EVERY day since Aug 11 (base64, name+digits, and real-word templates all rotate through the noon slot; twainswee+spl1ce's exact 75/hr double was just the Aug 16 slice); h12 is the peak farm-push hour of the day (12,929 vs h11 12,321 vs h13 10,955). ugmoddev fired zombie bursts (0/75/0/0/115/0/0/0/187 — API-NEW-NAT-3- back at #1 with 187/hr at h0) yet holds 145/145 ledger hours: six days without one missed hour. elad-cmd ran a 2-hour shift (101/123) then off; Janfindl off-window as expected — day-3 morning-shift test lands Aug 17 h6–h8. New actors: ankitkapur1992-hlido/hlido-public (188/hr), rosskelsey8476 (145), noah07532 (167); danialzivehdadr returned for a 4-hour evening shift (h22–h1, 289/229/239/103). NEW OBSERVATION: bogdanstancu1119-maker — a -maker suffix account churning 288–716 events/hr across 12 repos for 20+ hours, invisible to push-farm detection (commit-based churn, not pushes). Demotions eased but stayed hot (2,700→2,100/hr): thirteen of the top-15 all-time demotion hours now sit in the last ~2 days. Ledger 26,761 (25,062 confirmed) — SECOND consecutive decline (pruning outran the ~92/hr mint). HN: 49310247 alive 36h+ (all-time URL-post record); 49319786 re-verified dead via the Firebase API (delayed-kill held) — methodology lesson: the author /submitted view HIDES [dead] markers, only the API is trustworthy. 75 of 145 hours ≥50% · 23.74M events." },
  { when: "Aug 17 · hours 4–6", title: "THE LEAD-TIME RULE IS REBORN — 7th live pass: 1,338 minted → 4,830 in 4h → h6 re-breach 53.0% (v5.31)", body: "The collapse lasted exactly two hours. h3 42.2% → h4 29.6% (−12.6pt, the dip — the batch parked) → h5 37.5% → h6 53.0% RE-BREACH (+15.5pt): mint→dip→breach in 2–3h, the 7th consecutive live lead-time pass (5th formal). This time the factory did NOT stop after one magazine — it minted 1,338 (h3) → 1,237 (h4) → 1,409 (h5) → 846 (h6) = 4,830 fresh accounts in 4 hours, the biggest sustained minting burst in 44h (3,984 in the h3–h5 triple = 3rd-biggest 3h mint ever, behind 4,151/4,050) — mint-at-collapse is no longer a one-hour signature, it is a 4-hour magazine. Janfindl's day-3 morning shift FALSIFIED: after two days of h6–h8 (105/76/90, 123/77/89) it was a NO-SHOW at h6–h8 day 3 (and h4/h5) — a 2-day pattern, not a cron; the shift-worker hypothesis dies with it (last seen Aug 16 h10). zerotraceh1's return was a ONE-NIGHT micro-comeback: 19/24/12 at h1–h3 then ZERO at h4–h6 — every cycle weaker (peak 555/hr Aug 12 → ~20/hr now); the cycler is winding down. The h2-shift trio CORRECTED: reinatomait/yonghuy/nuanton are NOT h2-only — raw-archive scans show them dripping 8–26 pushes/hr on the SAME repos (cvabyf/pvwpiq/azwqvc) at h2 AND h4 AND h5 AND h6 — they're steady low-rate pushers, invisible in every top-list. But a TRUE h2-only cohort exists: 48 actors whose bot_watch activity is confined to h2 across 7 days (8/11/1/3/9/14/3 per day, ~105–160/hr, with 418/hr outliers) — the h2 shift mirrors the h12 cohort, and h2 total farm pushes (22,408) edge out h1 (22,188) and crush h3 (18,306): the scheduler runs BOTH an h2 and an h12 shift. bogdanstancu1119-maker STILL PUMPING: 334/300/232 events h4–h6 (#1 non-bot actor again), pushed 07:16Z per API (13 repos) — the push-spray farm never sleeps. ugmoddev zombie pattern intact (157/66/68; 0/75/0/0/115/0/0/0/187/0/158/0/157/66/68 in 14h) but 151/151 ledger hours; elad-cmd off h4–h5, back 73 at h6 (psycho-usage). New real-word one-hits: BailiffDisengage (112/119 h5–h6), jawabing (89 h4), zerian879 (87 h4). Ledger 28,146 (25,603 confirmed) — 4th-decline streak BROKEN, +1,733: the 4,830-mint finally outran TTL pruning. Demotions 1,703/2,197/2,673 — no new all-time top-15. HN: 49310247 ALIVE 42h+ (record URL post), karma 3 → no posts. 78 of 151 hours ≥50% · 24.75M events." },
  { when: "Aug 17 · hours 1–3", title: "THE 18-HOUR SIEGE BREAKS — and the factory answers with its biggest magazine in 44 hours (v5.30)", body: "The record run did not just end — it doubled the old record first. h1 58.5% → h2 62.8% extended the siege to EIGHTEEN consecutive ≥50% hours (h9 Aug 16 → h2 Aug 17; the pre-siege all-time record was 10), then h3 collapsed to 42.2% (−20.6pt, the first sub-50% hour in 18). Post-peak-collapse was falsified five times during the run, but the collapse finally came — on schedule with the factory: 75 → 299 → 1,338 fresh accounts minted h1→h3, the 4th-biggest single-hour mint ever (behind 1,630/1,553/1,497) and the first ≥1,000 magazine since Aug 16 h7 — mint-at-collapse is now the factory's signature (2,002 at h12 Aug 14, 1,497 at h6 Aug 15, 1,180 at h14 Aug 15, 1,338 at h3). The lead-time rule's next live test: breach expected h4–h6 (next run). zerotraceh1 RETURNED (19/24/12 pushes h1–h3 — first activity since Aug 16 h9), the cycler re-entering exactly as the streak died; elad-cmd ran a clean 3-hour shift (164/157/88, psycho-usage #2 at h2); ugmoddev active all window (266/251/141; noti-api-server 158 at h2) — no zombie gap this time. srjordan6/twoai-content worked its second straight night (212/183) — a night-shift worker, not a one-hit. New real-word one-hits: flintassemblyduel (320 h1), Fueltricharge (316/210 h1–h2), SkinCorporal (169 h2), SailorEnliven (145 h3), contrerasjake7319 (200/132 h2–h3); animal-lover12 = new persistent veteran (8 of 9h, 89–169/hr). CORRECTIONS via archive-level tracing: (1) bogdanstancu1119-maker — #1 non-bot actor at 710/634/353 events/hr — is a PUSH-SPRAY farm, not commit-based: 100% PushEvents across 13 repos at ~27–55/repo/hr, every repo under the top-15 cutoff (invisible in bot_watch/demoted, but ledger-tracked 62h and its repos ARE demoted from heat). (2) 'h12-only' was a visibility artifact: 41 of 46 noon-cohort actors are genuinely h12-only across six scanned night hours, but loganfoxdale drips 18–60/hr at h1–h3 nightly (two days verified) and reinatomait/yonghuy/nuanton ALL fired at exactly Aug 17 h2 on fresh 6-char repos — the scheduler runs an h2 shift too. (3) ledger hours for veterans are dense first→last intervals (148/148 = interval coverage, not per-hour activity). Ledger 26,413 (23,414 confirmed) — third consecutive decline (pruning still outruns the mint). Demotions cooled: 1,821/2,310/2,006. HN: 49310247 alive 39h+ (all-time URL-post record), karma 3 → no posts (discipline). 77 of 148 hours ≥50% · 24.25M events." },
  { when: 'Aug 17 · hours 10–12', title: 'THE WAVE COLLAPSES — 25.5% at h12, the 3rd-lowest spam hour ever; the noon ritual fires day 7; the factory re-arms at noon (v5.33)', body: 'The oscillation regime broke DOWNWARD: h9 57.1% → h10 41.3% → h11 32.3% → h12 25.5% — three straight sub-50% hours, −31.6pt in 3h, and h12 25.5% is the 3rd-lowest hour in 157h of history (only h13 Aug14 22.5% and h5 Aug13 23.4% sit lower; today\'s noon also ran 19pt under its own 7-day h12 average of 44.4%). The collapse is real, not a daily-cycle artifact: total events cratered 148,658 (h8) → 79,925 (h12), −46% in 4h, with h10–h12 all running 38–48% BELOW their 7-day hour averages — farm push volume fell ~76% in 4 hours (≈85K/hr → ≈20K/hr). THE STANDING ARMY RAN DRY: elad-cmd zeroed for 6 straight hours (was 164/hr); ugmoddev faded to 51/40/63 (6× below its 364/hr peak); zerotraceh1 passed 27h silent — the 555/hr cycler is retired (2nd full zero day); DevZonayed was a one-night farm after all; animal-lover12 left every visible list. NOON RITUAL DAY 7: loganfoxdale/d3 pushed 93/hr at EXACTLY h12 and zero anywhere else — 7 consecutive days (312/351/183/227/119/109/93), now the #1 farm of its own hour, joined by a fresh noon shift (burthxgeetse 48, wuxgt00 46, acancressien 46, zysladsdmpl 45, lao2flui 44). THE FACTORY RE-ARMED AT NOON: 356 minted h12 — biggest hour since h7 — and ledger first-seen at h12 has run 967/584/471 for three straight days: noon is the factory\'s favourite mint hour. AUG 14 PRECEDENT: the record 2,002-mint at h12 → h13 22.5% all-time low → h14 55.2% breach. TODAY: 356 minted → h12 25.5% dip. Mint→dip→breach predicts a breach at h13–h15 — run 48 is the test. bogdanstancu1119-maker survived (174/189/205 — its decay was noise; it is now the only spray farm standing, 1 vs 2 at h8). Demotions cooled to 1,781/1,337/1,207. Ledger 26,890 (25,027 confirmed), 3rd straight decline — TTL pruning outruns minting; the farm population is contracting. HN: 49310247 alive 49h+ (record URL post), karma 3 → no posts.' },
];

// ---------- page ----------
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>State of GitHub Spam — a ${series.length}-hour investigation by GitHub Pulse</title>
<meta name="description" content="How much of GitHub's public push traffic is automated spam? A live, hour-by-hour investigation: push-farms, botnets, adaptation, and the arms race to detect them.">
<meta property="og:type" content="article">
<meta property="og:title" content="State of GitHub Spam — the botnet economy inside the public event stream">
<meta property="og:description" content="${series.length} hours of the full GH Archive, audited: ~${Math.round(avgSpam)}% of all pushes are spam from automated farms. See the charts, the farms, and the arms race.">
<meta property="og:url" content="https://github-pulse.surge.sh/report.html">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧟</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#07070c;--panel:#0e0e18;--panel2:#12121f;--border:#1d1d2e;--text:#e8e8f2;--dim:#8b8ba3;--faint:#5a5a74;--accent:#7c6cff;--gold:#ffd166;--silver:#c0c7d1;--bronze:#e08e5a;--green:#34d399;--red:#f87171;--orange:#fb923c;--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--sans:'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased}
.bg-glow{position:fixed;inset:0;pointer-events:none;background:radial-gradient(900px 500px at 75% -10%,rgba(124,108,255,.10),transparent 60%),radial-gradient(700px 420px at 10% 110%,rgba(248,113,113,.06),transparent 60%);z-index:0}
.bg-grid{position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(124,108,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(124,108,255,.045) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse 90% 60% at 50% 0%,#000 30%,transparent 75%);z-index:0}
.wrap{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:0 20px}
.topbar{border-bottom:1px solid var(--border);background:rgba(7,7,12,.8);backdrop-filter:blur(8px);position:sticky;top:0;z-index:5}
.topbar-inner{display:flex;align-items:center;justify-content:space-between;height:58px}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--text);font-weight:700;letter-spacing:.02em}
.brand-mark{font-size:18px}
.brand-name{font-size:14px;letter-spacing:.18em}
.nav a{color:var(--dim);text-decoration:none;font-size:12.5px;margin-left:18px;transition:color .15s}
.nav a:hover{color:var(--accent)}
.nav .live{color:var(--accent);font-family:var(--mono)}
.hero{padding:72px 0 20px}
.kicker{font-family:var(--mono);font-size:12px;letter-spacing:.22em;color:var(--accent);text-transform:uppercase}
.hero h1{font-size:44px;line-height:1.08;letter-spacing:-.02em;margin:14px 0 16px;font-weight:700}
.hero h1 .accent{color:var(--accent)}
.hero p.sub{color:var(--dim);font-size:16.5px;max-width:760px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:36px 0 8px}
.stat{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px 18px 14px}
.stat-num{font-family:var(--mono);font-size:24px;font-weight:600;color:var(--text)}
.stat-num.warn{color:var(--red)}
.stat-num.good{color:var(--green)}
.stat-label{font-size:10.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.12em;margin-top:3px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:26px 26px 24px;margin:26px 0}
.panel-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.panel-head h2{font-size:18px;font-weight:600;letter-spacing:-.01em}
.h-num{color:var(--accent);font-family:var(--mono);font-size:13px}
.panel-sub{color:var(--faint);font-size:12.5px}
.lede{color:var(--dim);font-size:14.5px;max-width:820px;margin:8px 0 18px}
.chart{width:100%;height:auto;margin:10px 0 4px}
.chart .ax{fill:var(--faint);font-family:var(--mono);font-size:10px}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:12px}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);font-weight:500}
td{padding:8px 10px;border-bottom:1px solid #161624;color:var(--dim)}
td.mono,th.mono{font-family:var(--mono);font-size:12.5px}
tr:hover td{background:rgba(124,108,255,.04)}
td a{color:var(--text);text-decoration:none}
td a:hover{color:var(--accent)}
.badge{display:inline-block;font-family:var(--mono);font-size:10.5px;padding:2px 8px;border-radius:99px;border:1px solid var(--border);color:var(--dim)}
.badge.red{border-color:rgba(248,113,113,.4);color:var(--red)}
.badge.green{border-color:rgba(52,211,153,.35);color:var(--green)}
.tl{border-left:2px solid var(--border);margin:18px 0 6px;padding-left:24px}
.tl-item{position:relative;padding:0 0 26px}
.tl-item:last-child{padding-bottom:6px}
.tl-item::before{content:'';position:absolute;left:-29px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(124,108,255,.15)}
.tl-item .when{font-family:var(--mono);font-size:11.5px;color:var(--accent);letter-spacing:.06em}
.tl-item h3{font-size:16px;font-weight:600;margin:3px 0 5px}
.tl-item p{color:var(--dim);font-size:14px;max-width:780px}
.badge-new{font-size:.72em;color:#fbbf24;border:1px solid #fbbf24;border-radius:8px;padding:1px 6px;margin-left:4px;font-weight:700}
.anatomy{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px}
.an{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.an .k{font-family:var(--mono);font-size:11px;color:var(--red);letter-spacing:.08em;text-transform:uppercase}
.an p{color:var(--dim);font-size:13.5px;margin-top:4px}
.note{background:rgba(124,108,255,.06);border:1px solid rgba(124,108,255,.22);border-radius:12px;padding:16px 18px;font-size:13.5px;color:var(--dim);margin-top:16px}
.note b{color:var(--text)}
.footer{border-top:1px solid var(--border);margin-top:46px;padding:30px 0 60px;color:var(--faint);font-size:13px}
.footer a{color:var(--accent);text-decoration:none}
.footer .row{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:14px;font-size:13.5px}
@media(max-width:640px){.hero h1{font-size:32px}.panel{padding:20px 16px}}
</style>
</head>
<body>
<div class="bg-glow" aria-hidden="true"></div>
<div class="bg-grid" aria-hidden="true"></div>

<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="./"><span class="brand-mark">📡</span><span class="brand-name">GITHUB&nbsp;PULSE</span></a>
    <div class="nav">
      <a class="live" href="./">← live radar</a>
      <a href="data/digest.xml">RSS</a>
      <a href="https://github.com/Atheistam/github-pulse">source</a>
    </div>
  </div>
</header>

<main class="wrap">
  <section class="hero">
    <div class="kicker">🧟 Investigation · ${esc(firstLabel)} → ${esc(lastLabel)} · auto-generated hourly</div>
    <h1>The <span class="accent">State of GitHub Spam</span></h1>
    <p class="sub">GitHub publishes every public event — push, PR, issue, star — into the GH Archive, hour by hour. We process the whole stream and found something strange: a large fraction of the pushes are not people. They are automated <b>push-farms</b> — fleets of auto-created accounts pushing to freshly-created gibberish repositories, hundreds of times per hour, forever. This is what ${n} hours of looking at them looks like.</p>
    <div class="stats">
      <div class="stat"><div class="stat-num">${fmt(n)}</div><div class="stat-label">hours observed</div></div>
      <div class="stat"><div class="stat-num">${fmt(totalEvents)}</div><div class="stat-label">events processed</div></div>
      <div class="stat"><div class="stat-num warn">${pct(avgSpam)}</div><div class="stat-label">avg share of pushes that are spam</div></div>
      <div class="stat"><div class="stat-num warn">${pct(cur.spam)}</div><div class="stat-label">right now (${esc(cur.label)})</div></div>
      <div class="stat"><div class="stat-num">${fmt(farmList.length)}</div><div class="stat-label">farms tracked</div></div>
      <div class="stat"><div class="stat-num">${fmt(totalDemoted + totalSuspicious)}</div><div class="stat-label">repos demoted from rankings</div></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">01</span> Half of GitHub's pushes are not human</h2></div>
    <div class="lede">Each bar is one hour. The line is the share of that hour's <i>pushes</i> judged to be farm spam — accounts with no human signal (no PRs, issues, stars, forks, or releases), pushing to fresh auto-generated repos. It swings between <b>${pct(Math.min(...series.map(s=>s.spam)))}</b> and <b>${pct(Math.max(...series.map(s=>s.spam)))}</b> — never below a third, sometimes above six-tenths. The farms ebb and flow; they never leave.</div>
    ${lineChart(series, { key: 'spam', color: '#f87171', unit: '%', label: 'spam share of all pushes per hour', floor: 0 })}
    <div class="lede" style="margin-top:14px">How much farm traffic was caught per hour: repos demoted out of the rankings for farm behaviour (red) plus suspicious push-loops (grey). The last hours are the most aggressive the farms have been since we started watching.</div>
    ${bars(series, { key: 'demoted', color: '#f87171', label: 'farm repos demoted per hour' })}
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">02</span> The farms</h2><span class="panel-sub">persistent actors, tracked across hours — repos rotate, accounts persist</span></div>
    <div class="lede">These are the longest-running operations. <b>hours seen</b> counts distinct hours the farm appeared; <b>peak</b> is its most pushes in a single hour. LiamBruhin/SillyStuff — one account, one repo, up to 690 pushes in an hour — has outlasted every countermeasure so far.</div>
    <table>
      <tr><th>farm / repo</th><th class="mono">hours seen</th><th class="mono">peak pushes/hr</th><th class="mono">first → last seen</th></tr>
      ${farmList.slice(0, 20).map(f => `<tr><td><a href="https://github.com/${esc(f.repo)}" rel="noopener">${esc(f.repo)}</a></td><td class="mono">${f.hours_seen}</td><td class="mono">${fmt(f.max_pushes)}</td><td class="mono">${esc(f.first)} → ${esc(f.last)}</td></tr>`).join('')}
    </table>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">03</span> The 3-hour cadence &amp; the account factory</h2><span class="panel-sub">v5.31 — THE LEAD-TIME RULE IS REBORN (h3 42.2% → h4 29.6% dip → h6 53.0% re-breach, 7th live pass); factory mints 4,830 in 4h (3rd-biggest 3h ever 3,984); Janfindl day-3 FALSIFIED; h2-shift cohort = 48 actors; ledger 28,146 (+1,733, decline streak broken)</span></div>
    <div class="lede">Between Aug 13 06:00 and 15:00 UTC the spam share stopped drifting and started <b>pulsing</b>: 66.2% → 62.8% → 53.0% → 60.2% — a surge every ~3 hours with 23–40% lulls between. The engine was visible in the ledger: <b>${factorySurges} of ${cadenceRows.length} surges (≥50%) had a minting run of ≥500 freshly-created throwaway accounts within 4 hours prior</b>, average lead <b>${leadAvg}h</b> — accounts are minted, then deployed to push repos. Aug 11's peaks had almost no fresh accounts (fleet rotation); Aug 12 onward it was mint-and-burn.</div>
    <table style="margin-top:14px">
      <tr><th>surge (peak hour)</th><th class="mono">spam %</th><th class="mono">lead time</th><th class="mono">factory batch</th></tr>
      ${cadenceTable}
    </table>
    ${hoursSincePeak !== null ? `<div class="lede" style="margin-top:16px;border-left:3px solid #22c55e;padding-left:12px"><b>VERDICT (v5.33): THE WAVE COLLAPSED — h12 25.5% is the 3rd-lowest spam hour in 157h (only h13 Aug14 22.5% and h5 Aug13 23.4% were lower; the h12 7-day norm is 44.4%, so today's noon landed 19pt under its own average). The oscillation regime broke downward: h9 57.1% → h10 41.3% (−15.8pt) → h11 32.3% (−9.0) → h12 25.5% (−6.8) = three straight sub-50% hours, −31.6pt in 3h — and the collapse is REAL, not a daily-cycle artifact: total events cratered 148,658 (h8) → 79,925 (h12) = −46% in 4h, and h10–h12 all ran 38–48% BELOW their 7-day hour averages. Farm push volume fell ~76% in 4h (≈85K/hr → ≈20K/hr). THE STANDING ARMY FINALLY RAN DRY — the force that carried the 18-hour siege and the 16-hour record streak on a dead factory is spent: elad-cmd ZERO for 6 straight hours (was 164/hr), ugmoddev down to 51/40/63 (6× below its 364/hr peak), zerotraceh1 silent 27h+ (2nd full zero day — the 555/hr cycler is retired), DevZonayed gone after one night, animal-lover12 faded from every list. NOON RITUAL DAY 7: loganfoxdale/d3 pushed 93/hr at EXACTLY h12 and zero anywhere else — seven consecutive days (312/351/183/227/119/109/93, 1,394 total), now the #1 farm of its own hour, with a fresh 5+ actor noon shift alongside it (burthxgeetse 48, wuxgt00 46, acancressien 46, zysladsdmpl 45, lao2flui 44). THE FACTORY RE-ARMED AT THE NOON SLOT: 356 minted h12 (biggest single hour since h7; ledger first-seen at h12 has run 967/584/471 for three straight days — noon is the factory's favourite mint hour). AUG 14 PRECEDENT: the record 2,002-mint at h12 → h13 22.5% all-time low → h14 55.2% (+32.7pt breach). TODAY: 356 minted → h12 25.5% dip. Mint→dip→breach says a breach lands h13–h15 — RUN 48 IS THE TEST. bogdanstancu1119-maker survived the collapse (174/189/205 events — its 'decay' was noise around a lower plateau; it is now the ONLY spray farm standing: 1 vs 2 at h8). Demotions cooled to 1,781/1,337/1,207 — enforcement quiet because there is less to catch. Ledger 26,890 (25,027 confirmed), 3rd straight decline (−442/−689): TTL pruning is outrunning the minting — the farm population is contracting hard. HN: 49310247 ALIVE 49h+ (record URL post), score 3, karma 3 → no posts. 80 of 157 hours ≥50% · 25.44M events.</b></div>` : ''}
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">03b</span> The spray-farm radar</h2><span class="panel-sub">v5.31 — farms that spray pushes across many repos to stay under every cutoff</span></div>
    <div class="lede">Some farms never appear in any top list: instead of pushing 150+/hr into ONE repo, they spread 100–700 total pushes across 4–15 repos at 15–55/repo/hr — every repo individually under the top-15 bot_watch cutoff. <b>bogdanstancu1119-maker</b> was the prototype (710/634/353 events/hr, 13 repos, invisible for 60+ hours until archive-traced). This panel scans the raw archive each hour for the spray signature: total ≥100 pushes/hr, ≥4 repos, max ≤70 pushes on any single repo. It is the counter to the "just under the cutoff" adaptation.</div>
    ${sprayRadar && sprayRadar.farms && sprayRadar.farms.length ? `<div class="stats" style="margin:18px 0">
      <div class="stat"><div class="stat-num">${sprayRadar.farms.length}</div><div class="stat-label">spray farms (hour ${esc(sprayRadar.hour)})</div></div>
      <div class="stat"><div class="stat-num">${sprayRadar.farms.reduce((a, f) => a + f.total, 0)}</div><div class="stat-label">total pushes sprayed this hour</div></div>
      <div class="stat"><div class="stat-num">${sprayRadar.farms.filter(f => !f.known).length}</div><div class="stat-label">not yet in the farm ledger</div></div>
    </div>
    <table style="margin-top:14px">
      <tr><th>actor</th><th class="mono">total pushes</th><th class="mono">repos</th><th class="mono">max/repo</th><th class="mono">avg/repo</th><th>top repos (pushes)</th></tr>
      ${sprayRadar.farms.map(f => `<tr><td><a href="https://github.com/${esc(f.actor)}" rel="noopener">${esc(f.actor)}</a>${f.known ? '' : ' <span class="badge-new">new</span>'}</td><td class="mono">${f.total}</td><td class="mono">${f.repos}</td><td class="mono">${f.max_repo}</td><td class="mono">${f.avg_repo}</td><td class="dim">${esc((f.top_repos || []).join(' · '))}</td></tr>`).join('')}
    </table>` : '<div class="lede" style="margin-top:14px">No spray signature in the latest hour — the radar is watching.</div>'}
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">04</span> The star-bomb radar</h2><span class="panel-sub">v5.2 — watching the last untaxed heat vector</span></div>
    <div class="lede">Every heat vector the farms ever used — pushes, self-PRs, self-issues — now demotes them. That leaves <b>stars</b> (×8 heat) as the only remaining way to rank a repo, so star-bombing is the predicted next adaptation. The radar counts <b>pure-watcher accounts</b> (their only activity all hour is starring) and flags <b>bare repos</b> (stars with zero pushes/PRs/issues/releases). A repo whose stars come from co-starring lurker clusters, known-farm actors, or a ≥5★ burst that appears out of nowhere is demoted ×0.3 as a <b>star-loop</b>; ambiguous cases get an informational 🔭 badge instead of punishment — a legit viral repo is identical to a bomb for one hour, and we refuse to hide real launches.</div>
    ${curRadar ? `<div class="stats" style="margin:18px 0">
      <div class="stat"><div class="stat-num">${curRadar.loops}</div><div class="stat-label">star-loops demoted (latest hour)</div></div>
      <div class="stat"><div class="stat-num">${curRadar.repos - curRadar.loops}</div><div class="stat-label">star-only repos under watch</div></div>
      <div class="stat"><div class="stat-num">${fmt(curRadar.watch_only_actors)}</div><div class="stat-label">pure-watcher accounts</div></div>
      <div class="stat"><div class="stat-num">${starLoopTotal}</div><div class="stat-label">star-loops caught (all hours)</div></div>
    </div>` : ''}
    ${radarHours.length > 1 ? lineChart(series, { key: 'starLoops', color: '#38bdf8', label: 'star-loops demoted per hour' }) : ''}
    ${curRadar && curRadar.loops_top && curRadar.loops_top.length ? `<table style="margin-top:14px">
      <tr><th>star-loop repo</th><th class="mono">stars</th><th class="mono">lurker watchers</th><th class="mono">co-stars</th><th>why</th></tr>
      ${curRadar.loops_top.map(l => `<tr><td><a href="${esc(l.url || 'https://github.com/' + l.repo)}" rel="noopener">${esc(l.repo)}</a></td><td class="mono">+${l.stars}★</td><td class="mono">${l.watchers}</td><td class="mono">${l.co_star}</td><td class="dim">${esc(l.reason || '')}</td></tr>`).join('')}
    </table>` : `<div class="lede" style="margin-top:14px">No star-loops in the latest hour — the radar is quiet, which is exactly what we want to see while it's watching.</div>`}
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">05</span> The arms race</h2><span class="panel-sub">they read the radar and adapt — so does the radar</span></div>
    <div class="tl">
      ${timeline.map(t => `<div class="tl-item"><div class="when">${esc(t.when)}</div><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p></div>`).join('')}
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">06</span> Anatomy of a push-farm</h2></div>
    <div class="anatomy">
      <div class="an"><div class="k">accounts</div><p>Auto-generated names — word + digits (<span class="mono">smithhoward5868</span>, <span class="mono">conleyricky202</span>), or bulk prefixes (<span class="mono">trnfvn-</span>, <span class="mono">brnfvn-</span>).</p></div>
      <div class="an"><div class="k">repos</div><p>Fresh gibberish names, one per account or rotating. Zero stars, forks, issues, PRs, or releases — no human ever touches them.</p></div>
      <div class="an"><div class="k">behaviour</div><p>100–700 pushes/hour from 1–2 actors. Often a single commit re-pushed to keep the repo “active” forever.</p></div>
      <div class="an"><div class="k">evasion</div><p>Volume adapts to detection thresholds (40 → 30 → 25 → 24/hr). Some launder pushes through GitHub Actions bots, or open PRs on their own repos to fake human signal.</p></div>
      <div class="an"><div class="k">newest trick</div><p>Aug 16: real-word usernames (forgetpwd, twainswee, spl1ce, janbeoty) — the generator now emits actual English words to dodge name-pattern fingerprints — and the noon ritual: loganfoxdale/d3 has pushed at exactly 12:00 UTC for six straight days (312/351/183/227/119/109/hr), same actor, same repo, cron-regular.</p></div>
      <div class="an"><div class="k">motive</div><p>Unclear. Candidates: GitHub-contribution SEO, Actions-compute reselling, profile inflation. We are still not sure — ask them.</p></div>
      <div class="an"><div class="k">tells</div><p>Zero human signal + ≤2 actors + name fingerprint + repeat appearances in the ledger. That combination is now the detector, not any threshold.</p></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">07</span> What survives the noise</h2><span class="panel-sub">the human GitHub is still in there</span></div>
    <div class="lede">Repos that kept charting in the top-25 hottest across many hours, and the languages with the most event-weight. The farms can flood the raw push count, but they cannot fake a PR, a review, or a star — the human signal survives.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px" class="two-col">
      <div>
        <div class="lede" style="margin-bottom:2px">Most persistent in the hot chart (appearances across hours)</div>
        <table>
          <tr><th>repo</th><th class="mono">appearances</th><th class="mono">total heat</th></tr>
          ${hotList.map(r => `<tr><td><a href="https://github.com/${esc(r.repo)}" rel="noopener">${esc(r.repo)}</a></td><td class="mono">${r.appears}</td><td class="mono">${fmt(r.heat)}</td></tr>`).join('')}
        </table>
      </div>
      <div>
        <div class="lede" style="margin-bottom:2px">Top languages by event-weight</div>
        <table>
          <tr><th>language</th><th class="mono">events</th><th class="mono">hours charted</th></tr>
          ${langList.map(l => `<tr><td>${esc(l.language)}</td><td class="mono">${fmt(l.events)}</td><td class="mono">${l.hours}</td></tr>`).join('')}
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">08</span> Method &amp; limits</h2></div>
    <div class="lede">Every hour the full GH Archive file for that hour is streamed (~150–170K events) and aggregated with zero dependencies. Spam judgement uses: absence of human interaction signals (PRs/issues/stars/forks/releases), actor counts, account-name fingerprints, and a persistent farm ledger with a 48-hour TTL (repos rotate, accounts persist).</div>
    <div class="note"><b>Honest caveats:</b> we see public events only — private activity, deleted repos and suspended accounts are invisible; Actions-generated traffic is a real signal source, so bots with <span class="mono">[bot]</span> suffixes are excluded unless they show farm behaviour; the percentage is of <i>pushes</i>, not events; and the farms adapt, so these numbers are a lower bound on the true share. Spam share may therefore be understated, not overstated.</div>
  </section>
</main>

<footer class="footer">
  <div class="wrap">
    <div class="row">
      <a href="./">📡 live radar</a>
      <a href="data/digest.xml">📰 RSS digest</a>
      <a href="https://github.com/Atheistam/github-pulse">🐙 source</a>
    </div>
    This page is generated automatically from ${fmt(n)} hourly snapshots (${esc(firstLabel)} → ${esc(lastLabel)}). Data: GH Archive (public GitHub events), ${pct(avgSpam)} average spam share, ${fmt(totalEvents)} events audited. Regenerated every hour with the live radar.
  </div>
</footer>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`[report] wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB, ${n} hours, ${fmt(totalEvents)} events)`);
